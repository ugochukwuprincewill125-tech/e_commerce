"""
python manage.py seed_data                 # categories, brands, products, images, coupons, sample reviews
python manage.py seed_data --no-reviews    # skip the sample customers/reviews
python manage.py seed_data --reset         # wipe the catalogue first, then seed again
python manage.py seed_data --clear-samples # REMOVE sample customers + their reviews (run before going live)

The command is idempotent: running it twice updates existing records rather
than duplicating them. Generated images live in media/products, media/categories
and media/brands and can be replaced from the Django admin at any time.
"""
import random
import zlib
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.brands.models import Brand
from apps.categories.models import Category
from apps.core.imaging import brand_logo_file, category_image_file, product_image_file
from apps.products.models import Product, ProductImage, ProductVariant
from apps.promotions.models import Coupon
from apps.reviews.models import Review
from apps.reviews.signals import refresh_product_rating

from .seed_catalog import BRANDS, CATEGORIES, COUPONS, PRODUCTS, SAMPLE_REVIEW_TEXT, SAMPLE_REVIEWERS

User = get_user_model()
SAMPLE_EMAIL_DOMAIN = "sample.timeline.invalid"
DEMO_EMAIL = "demo@timeline.test"
DEMO_PASSWORD = "Timeline@2026"


def sku_for(product_name, brand):
    """Deterministic, readable and unique SKU, e.g. TGS-APP-IPHO-3F9A."""
    prefix = "".join(ch for ch in (brand or "TGS").upper() if ch.isalnum())[:3]
    words = [w for w in slugify(product_name).upper().split("-") if w and w.upper() != prefix]
    body = (words[1] if len(words) > 1 and words[0] == (brand or "").upper() else (words[0] if words else "ITEM"))[:4]
    digest = f"{zlib.crc32(product_name.encode()) & 0xFFFF:04X}"
    return f"TGS-{prefix}-{body}-{digest}"


class Command(BaseCommand):
    help = "Seed the Timeline store with categories, brands, products, images, coupons and sample reviews."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete products/categories/brands before seeding.")
        parser.add_argument("--no-reviews", action="store_true", help="Do not create sample customers and reviews.")
        parser.add_argument("--no-images", action="store_true", help="Skip image generation (faster).")
        parser.add_argument("--clear-samples", action="store_true", help="Remove sample customers, reviews and the demo account, then exit.")

    def handle(self, *args, **opts):
        if opts["clear_samples"]:
            self.clear_samples()
            return

        random.seed(2026)
        with transaction.atomic():
            if opts["reset"]:
                self.stdout.write("Resetting catalogue…")
                Review.objects.all().delete()
                ProductImage.objects.all().delete()
                ProductVariant.objects.all().delete()
                Product.objects.all().delete()
                Category.objects.all().delete()
                Brand.objects.all().delete()

            categories = self.seed_categories(not opts["no_images"])
            brands = self.seed_brands(not opts["no_images"])
            products = self.seed_products(categories, brands, not opts["no_images"])
            self.seed_coupons()
            self.seed_demo_user()
            if not opts["no_reviews"]:
                self.seed_reviews(products)

        self.stdout.write(self.style.SUCCESS(
            f"\nDone: {Category.objects.count()} categories, {Brand.objects.count()} brands, "
            f"{Product.objects.count()} products, {ProductImage.objects.count()} images, "
            f"{Review.objects.count()} reviews, {Coupon.objects.count()} coupons."
        ))
        self.stdout.write(f"Demo customer login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
        self.stdout.write("Before launch run: python manage.py seed_data --clear-samples")

    # ------------------------------------------------------------------ #
    def seed_categories(self, images):
        shapes = {}
        by_slug = {}
        for order, (slug, name, _parent, icon, shape, featured, desc) in enumerate(CATEGORIES):
            cat, _ = Category.objects.update_or_create(
                slug=slug,
                defaults=dict(name=name, icon=icon, description=desc, is_featured=featured, display_order=order, is_active=True),
            )
            by_slug[slug] = cat
            shapes[slug] = shape
        for slug, _name, parent, *_ in CATEGORIES:
            cat = by_slug[slug]
            cat.parent_category = by_slug.get(parent) if parent else None
            if images and not cat.image:
                cat.image.save(f"{slug}.jpg", category_image_file(shapes[slug], cat.name, f"{slug}.jpg"), save=False)
            cat.save()
        self.stdout.write(f"  ✓ {len(by_slug)} categories")
        return by_slug

    def seed_brands(self, images):
        brands = {}
        for name, featured, website, desc in BRANDS:
            brand, _ = Brand.objects.update_or_create(
                slug=slugify(name),
                defaults=dict(name=name, is_featured=featured, website=website, description=desc, is_active=True),
            )
            if images and not brand.logo:
                brand.logo.save(f"{brand.slug}.png", brand_logo_file(name, f"{brand.slug}.png"), save=True)
            brands[name] = brand
        self.stdout.write(f"  ✓ {len(brands)} brands")
        return brands

    def seed_products(self, categories, brands, images):
        products = []
        now = timezone.now()
        for index, data in enumerate(PRODUCTS):
            slug = slugify(data["name"])
            variants = data["variants"]
            stock = sum(v[3] for v in variants) if variants else data["stock"]
            defaults = dict(
                name=data["name"],
                sku=sku_for(data["name"], data["brand"]),
                category=categories[data["category"]],
                brand=brands.get(data["brand"]),
                product_type=data["product_type"],
                price=Decimal(data["price"]),
                discount_price=Decimal(data["discount_price"]) if data["discount_price"] else None,
                stock_quantity=stock,
                featured=data["featured"],
                bestseller=data["bestseller"],
                new_arrival=data["new_arrival"],
                short_description=data["short"],
                description=data["description"],
                specifications=data["specs"],
                warranty=data["warranty"],
                meta_title=f"{data['name']} | Timeline Gadgets"[:70],
                meta_description=data["short"][:160],
                is_active=True,
            )
            product, created = Product.objects.update_or_create(slug=slug, defaults=defaults)
            if created:
                # Spread creation dates so "newest" sorting looks natural.
                Product.objects.filter(pk=product.pk).update(created_at=now - timedelta(days=len(PRODUCTS) - index))

            for order, (vtype, value, adj, vstock, hexcol) in enumerate(variants):
                ProductVariant.objects.update_or_create(
                    product=product, variant_type=vtype, value=value,
                    defaults=dict(
                        sku=f"{product.sku}-{slugify(value).upper()}"[:60],
                        price_adjustment=Decimal(adj), stock_quantity=vstock, color_hex=hexcol,
                        display_order=order, is_active=True,
                    ),
                )

            if images and not product.images.exists():
                colours = [v[4] for v in variants if v[4]] or [data["colour"]]
                shots = [(0, colours[0]), (1, colours[0])]
                if len(colours) > 1:
                    shots.append((0, colours[1]))
                for order, (variant, colour) in enumerate(shots):
                    filename = f"{slug}-{order + 1}.jpg"
                    img = ProductImage(product=product, alt_text=f"{product.name} — view {order + 1}", display_order=order)
                    img.image.save(filename, product_image_file(data["shape"], filename, colour, variant, seed=index * 7 + order), save=True)
            products.append(product)
            if (index + 1) % 10 == 0:
                self.stdout.write(f"    … {index + 1} products")
        self.stdout.write(f"  ✓ {len(products)} products")
        return products

    def seed_coupons(self):
        for code, dtype, value, minimum, cap, desc in COUPONS:
            Coupon.objects.update_or_create(
                code=code,
                defaults=dict(
                    discount_type=dtype, discount_value=Decimal(value), minimum_order=Decimal(minimum),
                    maximum_discount=Decimal(cap) if cap else None, description=desc, active=True,
                    expiry_date=timezone.now() + timedelta(days=365),
                ),
            )
        self.stdout.write(f"  ✓ {len(COUPONS)} coupons (WELCOME10, TIMELINE5K)")

    def seed_demo_user(self):
        user, created = User.objects.get_or_create(
            email=DEMO_EMAIL,
            defaults=dict(first_name="Demo", last_name="Customer", phone="08000000000", email_verified=True),
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        self.stdout.write(f"  ✓ demo customer {DEMO_EMAIL}")

    def seed_reviews(self, products):
        reviewers = []
        for first, last in SAMPLE_REVIEWERS:
            user, created = User.objects.get_or_create(
                email=f"{first.lower()}.{last.lower()}@{SAMPLE_EMAIL_DOMAIN}",
                defaults=dict(first_name=first, last_name=last, email_verified=True),
            )
            if created:
                user.set_unusable_password()
                user.save()
            reviewers.append(user)

        created_count = 0
        rnd = random.Random(7)
        for product in products:
            if not (product.bestseller or product.featured) and rnd.random() < 0.45:
                continue
            for reviewer in rnd.sample(reviewers, rnd.randint(1, 4)):
                rating = rnd.choices([5, 4, 3], weights=[6, 3, 1])[0]
                title, comment = rnd.choice(SAMPLE_REVIEW_TEXT[rating])
                _, made = Review.objects.get_or_create(
                    user=reviewer, product=product,
                    defaults=dict(rating=rating, title=title, comment=comment, is_approved=True, is_verified_purchase=False),
                )
                created_count += made
            refresh_product_rating(product.pk)
        self.stdout.write(f"  ✓ {created_count} sample reviews (remove with --clear-samples before launch)")

    def clear_samples(self):
        sample_users = User.objects.filter(email__endswith=f"@{SAMPLE_EMAIL_DOMAIN}")
        product_ids = set(Review.objects.filter(user__in=sample_users).values_list("product_id", flat=True))
        reviews, _ = Review.objects.filter(user__in=sample_users).delete()
        users = sample_users.count()
        sample_users.delete()
        demo = User.objects.filter(email=DEMO_EMAIL, orders__isnull=True)
        demo_count = demo.count()
        demo.delete()
        for pid in product_ids:
            refresh_product_rating(pid)
        self.stdout.write(self.style.SUCCESS(
            f"Removed {reviews} sample review rows, {users} sample customers and {demo_count} demo account(s)."
        ))

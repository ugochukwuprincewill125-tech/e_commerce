from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from django.db.models.functions import Lower
from django.utils import timezone

# The wording shown to a customer whose address is already taken. Every path
# that can hit a duplicate (registration, profile edit, Google sign-in, the
# manager) reuses this so the instruction is always the same.
DUPLICATE_EMAIL_ERROR = "An account with this email already exists. Please use a different email address."


def canonical_email(email):
    """The single spelling of an address that we store and compare against.

    Surrounding whitespace is trimmed and the whole address is lowercased, so
    "  Ada.Okafor@Example.com " and "ada.okafor@example.com" are recognised as
    the same person. Every write path funnels through this function, which is
    what lets the unique constraint on ``email`` mean "one account per
    address" rather than "one account per spelling".
    """
    return (email or "").strip().lower()


class DuplicateEmailError(ValueError):
    """Raised when an email address is already attached to another account."""


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = canonical_email(email)
        if self.model._default_manager.using(self._db).filter(email__iexact=email).exists():
            raise DuplicateEmailError(DUPLICATE_EMAIL_ERROR)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)  # PBKDF2 hashing via Django's password hashers
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("email_verified", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=30, blank=True)
    profile_image = models.ImageField(upload_to="users/", blank=True, null=True)
    email_verified = models.BooleanField(default=False)
    # Stable Google account identifier, populated when a customer first signs in
    # with Google. Null for password-only accounts.
    google_sub = models.CharField(max_length=64, unique=True, blank=True, null=True)
    date_joined = models.DateTimeField(default=timezone.now)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        ordering = ("-date_joined",)
        verbose_name = "customer"
        verbose_name_plural = "customers"
        constraints = [
            # The column's own unique=True only compares spelling exactly, so
            # "Ada@x.com" and "ada@x.com" could both sit in the table. This
            # makes the database itself reject a second row for the same
            # address, whichever code path wrote it — including the Django
            # admin and the shell, which never call the manager.
            models.UniqueConstraint(
                Lower("email"),
                name="users_user_email_lower_unique",
            ),
        ]

    def save(self, *args, **kwargs):
        # Normalise on every write. The Django admin edits `email` straight on
        # the model and never goes through the manager, so this is the only
        # place where every caller is guaranteed the same spelling.
        canonical = canonical_email(self.email)
        if canonical != self.email:
            self.email = canonical
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                kwargs["update_fields"] = set(update_fields) | {"email"}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.first_name


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=40, blank=True, help_text="e.g. Home, Office")
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    phone = models.CharField(max_length=30)
    address = models.CharField(max_length=255)
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80)
    country = models.CharField(max_length=80, default="Nigeria")
    postal_code = models.CharField(max_length=20, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-is_default", "-created_at")
        verbose_name_plural = "addresses"

    def __str__(self):
        return f"{self.first_name} {self.last_name}, {self.address}, {self.city}"

    def save(self, *args, **kwargs):
        with transaction.atomic():
            has_other = Address.objects.filter(user=self.user).exclude(pk=self.pk).exists()
            if not has_other:
                self.is_default = True
            if self.is_default:
                Address.objects.filter(user=self.user, is_default=True).exclude(pk=self.pk).update(is_default=False)
            super().save(*args, **kwargs)

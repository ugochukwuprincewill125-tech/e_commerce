from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    icon = models.CharField(
        max_length=40, blank=True, help_text="Lucide icon name used by the frontend, e.g. 'smartphone'."
    )
    parent_category = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children"
    )
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False, help_text="Show on the homepage category showcase.")
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("display_order", "name")
        verbose_name_plural = "categories"

    def __str__(self):
        return f"{self.parent_category.name} › {self.name}" if self.parent_category_id else self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def get_descendant_ids(self):
        """IDs of this category and every nested child (breadth-first, cycle safe)."""
        ids, frontier = {self.pk}, [self.pk]
        while frontier:
            children = list(
                Category.objects.filter(parent_category_id__in=frontier).exclude(pk__in=ids).values_list("pk", flat=True)
            )
            ids.update(children)
            frontier = children
        return ids

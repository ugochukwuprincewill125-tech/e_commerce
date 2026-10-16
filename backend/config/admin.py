"""Django admin gate — superusers only.

The default admin site admits any user with ``is_staff=True``. In this store
"admin" means the owner(s) (``is_superuser=True``), so the staff flag alone
must never open ``/admin`` (or whatever path ``DJANGO_ADMIN_URL`` is set to).
The admin REST API in ``apps.admin_api`` was already superuser-only; this makes
the server-rendered Django admin agree with it.

The gate is installed by swapping ``__class__`` on the default
``admin.site`` instance for a subclass: every app's ``ModelAdmin``
registrations, templates and settings are preserved untouched, only
``has_permission`` becomes stricter.
"""
from django.contrib import admin


class SuperuserAdminSite(admin.AdminSite):
    def has_permission(self, request):
        return bool(request.user and request.user.is_active and request.user.is_superuser)


admin.site.__class__ = SuperuserAdminSite

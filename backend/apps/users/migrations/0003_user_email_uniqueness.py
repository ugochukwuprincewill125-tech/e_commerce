"""Make email addresses unique regardless of case or surrounding whitespace.

The column's ``unique=True`` only compares spelling exactly, so "Ada@x.com"
and "ada@x.com" could both sit in the table. The Django admin writes the
address straight onto the model and never goes through the manager, so the
application-level check was not enough on its own.

This migration rewrites every stored address to its canonical form (trimmed,
lowercased), parks any legacy duplicate on a non-colliding alias, and then
adds a database level constraint that rejects a second row for the same
address no matter which code path wrote it.
"""
from django.db import migrations, models
from django.db.models.functions import Lower


def canonical(email):
    """Mirror of ``apps.users.models.canonical_email`` for historical rows."""
    return (email or "").strip().lower()


def alias_for(email, pk, attempt):
    """A unique address for a duplicate row that still reaches the same inbox.

    The ``+tag`` form is the standard aliasing convention, so the customer
    keeps receiving mail at the original address.
    """
    local, _, domain = (email or "").strip().partition("@")
    if not domain:
        return f"user{pk}.{attempt}@invalid.local"
    return f"{local}+dup{pk}.{attempt}@{domain}"


def normalise_emails(apps, schema_editor):
    User = apps.get_model("users", "User")
    db = schema_editor.connection.alias

    rows = list(
        User.objects.using(db).order_by("date_joined", "pk").values_list("pk", "email")
    )

    groups = {}
    for pk, raw in rows:
        groups.setdefault(canonical(raw), []).append((pk, raw))

    # Every canonical address is spoken for: a lone row keeps it, and in a
    # group the oldest row keeps it while the rest are parked on an alias.
    claimed = {address for address in groups if address}
    updates = {}

    for address, members in groups.items():
        if address:
            keeper_pk, keeper_raw = members[0]
            if address != keeper_raw:
                updates[keeper_pk] = {"email": address}
            duplicates = members[1:]
        else:
            # A blank address cannot belong to anybody, so every row in the
            # group is parked on an alias.
            duplicates = members

        for pk, raw in duplicates:
            attempt = 1
            alias = alias_for(raw, pk, attempt)
            while canonical(alias) in claimed:
                attempt += 1
                alias = alias_for(raw, pk, attempt)
            claimed.add(canonical(alias))
            updates[pk] = {"email": alias, "is_active": False}

    for pk, values in updates.items():
        User.objects.using(db).filter(pk=pk).update(**values)


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_google_sub"),
    ]

    operations = [
        migrations.RunPython(normalise_emails, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("email"),
                name="users_user_email_lower_unique",
            ),
        ),
    ]

from rest_framework import serializers

from .models import ContactMessage


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ("id", "name", "email", "phone", "subject", "message", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_message(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError("Please tell us a little more (at least 10 characters).")
        return value.strip()

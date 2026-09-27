"""Consistent error payloads for the React client.

Every error response contains a human readable `detail` string. Field
validation errors are also kept under `errors` so forms can highlight fields.
"""
from rest_framework.views import exception_handler


def _first_message(data):
    if isinstance(data, str):
        return data
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        if "detail" in data:
            return _first_message(data["detail"])
        key, value = next(iter(data.items()))
        message = _first_message(value)
        if key == "non_field_errors":
            return message
        return f"{key.replace('_', ' ').capitalize()}: {message}"
    return "Something went wrong."


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response

    data = response.data
    if isinstance(data, dict) and set(data.keys()) <= {"detail", "code", "messages"}:
        response.data = {"detail": _first_message(data)}
        if "code" in data:
            response.data["code"] = data["code"]
    else:
        response.data = {"detail": _first_message(data), "errors": data}
    return response

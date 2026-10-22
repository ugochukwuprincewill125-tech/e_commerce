"""Company information served to the frontend from a single source of truth."""
from django.conf import settings

COMPANY = {
    "name": "Timeline Gadgets Limited",
    "short_name": "Timeline Gadgets",
    "tagline": "Home of Quality Gadgets",
    "email": "timelinegadgets4@gmail.com",
    # Add the store phone numbers here once confirmed; the frontend shows
    # a "call us" block only when this list is not empty.
    "phones": [],
    "instagram": "https://www.instagram.com/timelinegadgets/",
    "instagram_handle": "@timelinegadgets",
    "locations": [
        {
            "id": "main-office",
            "label": "Main Office",
            "lines": [
                "#17, Oremeji Street,",
                "Micro Station Plaza,",
                "Computer Village,",
                "Ikeja, Lagos, Nigeria.",
            ],
            "map_query": "17 Oremeji Street, Computer Village, Ikeja, Lagos",
        },
        {
            "id": "branch",
            "label": "Branch",
            "lines": [
                "#11B, Otigba Street,",
                "Opposite Fidelity Bank,",
                "Computer Village,",
                "Ikeja, Lagos, Nigeria.",
            ],
            "map_query": "11B Otigba Street, Computer Village, Ikeja, Lagos",
        },
    ],
    "business_hours": [
        {"days": "Monday – Friday", "hours": "8:30 AM – 6:30 PM"},
        {"days": "Saturday", "hours": "9:00 AM – 6:00 PM"},
        {"days": "Sunday & Public Holidays", "hours": "Closed"},
    ],
}

SOUTH_WEST_STATES = {"lagos", "ogun", "oyo", "osun", "ondo", "ekiti"}

# The South East / South South band (plus Kwara, which couriers price with it).
SOUTH_EAST_SOUTH_SOUTH_STATES = {
    "abia", "anambra", "ebonyi", "imo", "enugu",
    "edo", "delta", "rivers", "bayelsa", "kwara",
}

# The northern half of the country, plus Akwa Ibom and Cross River — the
# highest courier band. Every state not in an earlier set belongs here, which
# keeps the four-zone map exhaustive for all 36 states and the FCT.
NORTH_STATES = {
    "adamawa", "akwa ibom", "bauchi", "benue", "borno", "cross river",
    "fct - abuja", "abuja", "fct", "gombe", "jigawa", "kaduna", "kano",
    "katsina", "kebbi", "kogi", "nasarawa", "niger", "plateau", "sokoto",
    "taraba", "yobe", "zamfara",
}

NIGERIAN_STATES = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja", "Gombe",
    "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto",
    "Taraba", "Yobe", "Zamfara",
]


def shipping_settings():
    return {
        "lagos": settings.SHIPPING_FEE_LAGOS,
        "south_west": settings.SHIPPING_FEE_SOUTH_WEST,
        "south_east": settings.SHIPPING_FEE_SOUTH_EAST_SOUTH_SOUTH,
        "north": settings.SHIPPING_FEE_NORTH,
        "default": settings.SHIPPING_FEE_DEFAULT,
        "free_shipping_threshold": settings.FREE_SHIPPING_THRESHOLD,
        "pickup": 0,
    }




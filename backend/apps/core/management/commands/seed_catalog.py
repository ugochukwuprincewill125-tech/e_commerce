"""
Sample catalogue for `python manage.py seed_data`.

Prices are realistic sample Naira prices for development/demo purposes —
update them in the Django admin to match Timeline's current price list.
Descriptions avoid dealership/authorisation claims on purpose.
"""

# (slug, name, parent_slug, icon, image_shape, featured, description)
CATEGORIES = [
    ("smartphones", "Smartphones", None, "smartphone", "phone", True, "Flagship, mid-range and budget smartphones from leading brands."),
    ("android-phones", "Android Phones", "smartphones", "smartphone", "phone", False, "Samsung, Tecno, Infinix, Xiaomi and more Android devices."),
    ("iphones", "iPhones", "smartphones", "smartphone", "phone", False, "Apple iPhone models in multiple storage options and colours."),
    ("tablets", "Tablets", None, "tablet", "tablet", True, "iPads and Android tablets for work, study and entertainment."),
    ("laptops", "Laptops", None, "laptop", "laptop", True, "Business, student and creator laptops from HP, Dell, Lenovo and Apple."),
    ("macbooks", "MacBooks", "laptops", "laptop", "laptop", False, "MacBook Air and MacBook Pro with Apple silicon."),
    ("desktop-computers", "Desktop Computers", None, "pc-case", "desktop", False, "Reliable desktop PCs and all-in-ones for offices and homes."),
    ("monitors", "Monitors", None, "monitor", "monitor", False, "Full HD, QHD and professional displays."),
    ("keyboards", "Keyboards", "computer-accessories", "keyboard", "keyboard", False, "Wired and wireless keyboards and desktop combos."),
    ("mice", "Mice", "computer-accessories", "mouse", "mouse", False, "Everyday, ergonomic and gaming mice."),
    ("computer-accessories", "Computer Accessories", None, "mouse-pointer-2", "keyboard", True, "Keyboards, mice, webcams and everything your desk needs."),
    ("laptop-accessories", "Laptop Accessories", "laptops", "briefcase", "laptop", False, "Sleeves, stands, cooling pads and docking hubs."),
    ("phone-accessories", "Phone Accessories", None, "plug-zap", "charger", True, "Chargers, cables, power banks and protection for your phone."),
    ("chargers", "Chargers", "phone-accessories", "plug-zap", "charger", False, "Fast USB-C PD and GaN wall chargers."),
    ("power-banks", "Power Banks", "phone-accessories", "battery-charging", "powerbank", True, "High-capacity portable power for long days."),
    ("usb-cables", "USB Cables", "phone-accessories", "cable", "cable", False, "Durable USB-C and USB-A cables for charging and data."),
    ("lightning-cables", "Lightning Cables", "phone-accessories", "cable", "cable", False, "Lightning cables for iPhone and iPad."),
    ("bluetooth-headsets", "Bluetooth Headsets", "headphones", "headset", "earbuds", False, "Hands-free headsets for calls on the move."),
    ("earbuds", "Earbuds", "headphones", "ear", "earbuds", True, "True wireless earbuds with long battery life."),
    ("headphones", "Headphones", None, "headphones", "headphones", True, "Over-ear and on-ear headphones, wired and wireless."),
    ("bluetooth-speakers", "Bluetooth Speakers", None, "speaker", "speaker", True, "Portable, waterproof speakers with big sound."),
    ("smart-watches", "Smart Watches", None, "watch", "watch", True, "Smartwatches for fitness, notifications and style."),
    ("smart-bands", "Smart Bands", "smart-watches", "activity", "band", False, "Lightweight fitness trackers with long battery life."),
    ("memory-cards", "Memory Cards", None, "memory-stick", "memorycard", False, "microSD and SD cards for phones, cameras and drones."),
    ("flash-drives", "Flash Drives", None, "usb", "flashdrive", False, "USB flash drives for quick, portable storage."),
    ("external-hard-drives", "External Hard Drives", None, "hard-drive", "hdd", False, "Portable HDDs for backups and large files."),
    ("ssds", "SSDs", None, "hard-drive-download", "ssd", False, "Internal NVMe and portable SSDs for speed."),
    ("networking-devices", "Networking Devices", None, "network", "router", True, "Routers, MiFi, modems and cabling for home and office."),
    ("wi-fi-routers", "Wi-Fi Routers", "networking-devices", "router", "router", False, "Dual-band and mesh Wi-Fi systems."),
    ("mifi", "MiFi", "networking-devices", "wifi", "mifi", False, "Pocket 4G hotspots to share internet anywhere."),
    ("modems", "Modems", "networking-devices", "radio-tower", "modem", False, "4G/LTE modems and CPE routers."),
    ("network-cables", "Network Cables", "networking-devices", "cable", "cable", False, "Cat6 patch cables and networking accessories."),
    ("cctv-security", "CCTV & Security", None, "cctv", "camera", False, "CCTV kits, IP cameras and security accessories."),
    ("gamepads", "Gamepads", "gaming-accessories", "gamepad-2", "gamepad", False, "Controllers for PC and console gaming."),
    ("gaming-accessories", "Gaming Accessories", None, "gamepad-2", "gamepad", True, "Gaming headsets, controllers and peripherals."),
    ("ipad-accessories", "iPad Accessories", "tablets", "tablet", "tablet", False, "Cases, stands and styluses for iPad."),
    ("mp3-mp4-players", "MP3/MP4 Players", None, "music", "mp3", False, "Portable music and media players."),
    ("software-antivirus", "Software & Antivirus", None, "shield-check", "software", False, "Security software and productivity licences."),
    ("power-backup", "Power & Backup", None, "zap", "ups", False, "UPS units and surge protection to keep you running."),
    ("digital-camera-accessories", "Digital Camera Accessories", None, "camera", "lens", False, "Tripods, lenses and accessories for creators."),
]

# (name, featured, website, description)
BRANDS = [
    ("Apple", True, "https://www.apple.com", "iPhone, iPad, MacBook and accessories."),
    ("Samsung", True, "https://www.samsung.com", "Galaxy smartphones, tablets, wearables and storage."),
    ("Tecno", True, "https://www.tecno-mobile.com", "Feature-packed smartphones built for everyday value."),
    ("Infinix", True, "https://www.infinixmobility.com", "Stylish smartphones with big batteries and fast charging."),
    ("Xiaomi", True, "https://www.mi.com", "Redmi phones, wearables and smart devices."),
    ("HP", True, "https://www.hp.com", "Laptops, desktops and monitors for work and study."),
    ("Dell", True, "https://www.dell.com", "Business laptops and professional displays."),
    ("Lenovo", True, "https://www.lenovo.com", "ThinkPad and IdeaPad laptops and tablets."),
    ("Anker", True, "https://www.anker.com", "Charging accessories and power banks."),
    ("Oraimo", True, "https://www.oraimo.com", "Affordable audio, power and charging accessories."),
    ("UGREEN", False, "https://www.ugreen.com", "Cables, hubs, chargers and accessories."),
    ("Baseus", False, "https://www.baseus.com", "Charging, cables and phone accessories."),
    ("JBL", True, "https://www.jbl.com", "Portable speakers and headphones."),
    ("Logitech", True, "https://www.logitech.com", "Keyboards, mice, webcams and gaming gear."),
    ("SanDisk", False, "https://www.westerndigital.com", "Memory cards and flash drives."),
    ("Kingston", False, "https://www.kingston.com", "Flash storage and SSDs."),
    ("Seagate", False, "https://www.seagate.com", "External and internal hard drives."),
    ("TP-Link", True, "https://www.tp-link.com", "Wi-Fi routers, mesh systems and MiFi."),
    ("Huawei", False, "https://consumer.huawei.com", "4G MiFi and home broadband routers."),
    ("Sony", False, "https://www.sony.com", "Headphones, audio and gaming accessories."),
    ("Hikvision", False, "https://www.hikvision.com", "CCTV and video security systems."),
    ("Kaspersky", False, "https://www.kaspersky.com", "Antivirus and internet security software."),
    ("APC", False, "https://www.apc.com", "UPS and power protection."),
    ("Ulanzi", False, "https://www.ulanzi.com", "Tripods and creator accessories."),
    ("Ruizu", False, "", "Portable MP3/MP4 media players."),
    ("Microsoft", False, "https://www.microsoft.com", "Xbox controllers and PC accessories."),
]

# Variant tuple: (type, value, price_adjustment, stock, color_hex)
P = []


def product(name, category, brand, ptype, shape, price, discount=None, stock=25, flags="", colour="#1f2937",
            short="", description="", specs=None, variants=None, warranty=""):
    P.append(
        dict(
            name=name, category=category, brand=brand, product_type=ptype, shape=shape, price=price,
            discount_price=discount, stock=stock, featured="F" in flags, bestseller="B" in flags,
            new_arrival="N" in flags, colour=colour, short=short, description=description,
            specs=specs or {}, variants=variants or [], warranty=warranty,
        )
    )


# ---------------------------- Smartphones ----------------------------------
product(
    "Apple iPhone 15 128GB", "iphones", "Apple", "device", "phone", 1250000, 1149000, 18, "FB", "#f1d5db",
    "6.1\" Super Retina XDR, Dynamic Island, 48MP main camera and USB-C.",
    "iPhone 15 brings the Dynamic Island, a 48MP main camera with 2x telephoto option and USB-C charging in a colour-infused glass and aluminium design. A16 Bionic keeps everything fast and efficient.",
    {"Display": "6.1\" Super Retina XDR OLED", "Chip": "A16 Bionic", "Storage": "128GB", "Main camera": "48MP + 12MP ultra wide", "Front camera": "12MP TrueDepth", "Port": "USB-C", "Water resistance": "IP68", "SIM": "Nano-SIM + eSIM"},
    [("storage", "128GB", 0, 10, ""), ("storage", "256GB", 180000, 6, ""), ("storage", "512GB", 420000, 2, "")],
)
product(
    "Apple iPhone 16 Pro Max 256GB", "iphones", "Apple", "device", "phone", 2450000, None, 8, "FN", "#bfb6a8",
    "6.9\" display, A18 Pro, pro camera system with 5x telephoto.",
    "The largest iPhone display yet paired with the A18 Pro chip, a titanium design, Camera Control and a 48MP Fusion camera with 5x telephoto for detailed shots from a distance.",
    {"Display": "6.9\" Super Retina XDR ProMotion", "Chip": "A18 Pro", "Storage": "256GB", "Main camera": "48MP Fusion + 48MP ultra wide + 12MP 5x telephoto", "Build": "Titanium", "Port": "USB-C (USB 3)"},
    [("color", "Desert Titanium", 0, 3, "#bfb6a8"), ("color", "Natural Titanium", 0, 3, "#a8a49c"), ("color", "Black Titanium", 0, 2, "#3b3b3d")],
)
product(
    "Apple iPhone 13 128GB", "iphones", "Apple", "device", "phone", 820000, 765000, 4, "B", "#1f3a5f",
    "A15 Bionic, dual 12MP cameras and all-day battery life.",
    "A dependable iPhone with the A15 Bionic chip, Cinematic mode video, a bright 6.1\" OLED display and excellent battery life — a great value way into the Apple ecosystem.",
    {"Display": "6.1\" Super Retina XDR OLED", "Chip": "A15 Bionic", "Storage": "128GB", "Cameras": "12MP wide + 12MP ultra wide", "Port": "Lightning"},
)
product(
    "Samsung Galaxy S24 Ultra 256GB", "android-phones", "Samsung", "device", "phone", 1850000, 1690000, 9, "FB", "#4b4f54",
    "Titanium frame, built-in S Pen, 200MP camera and Galaxy AI.",
    "Galaxy S24 Ultra combines a titanium frame, a flat 6.8\" QHD+ display, a 200MP main camera with 5x optical zoom and the built-in S Pen, powered by Snapdragon 8 Gen 3 for Galaxy.",
    {"Display": "6.8\" QHD+ Dynamic AMOLED 2X, 120Hz", "Processor": "Snapdragon 8 Gen 3 for Galaxy", "RAM": "12GB", "Storage": "256GB", "Main camera": "200MP", "Battery": "5000mAh, 45W", "S Pen": "Built-in"},
    [("storage", "256GB", 0, 6, ""), ("storage", "512GB", 250000, 3, "")],
)
product(
    "Samsung Galaxy A15 128GB", "android-phones", "Samsung", "device", "phone", 245000, 229000, 30, "B", "#1c2d4f",
    "6.5\" Super AMOLED, 50MP triple camera, 5000mAh battery.",
    "An affordable Galaxy with a vivid 6.5\" Super AMOLED screen, 50MP main camera and a 5000mAh battery that easily lasts all day.",
    {"Display": "6.5\" FHD+ Super AMOLED, 90Hz", "RAM": "6GB", "Storage": "128GB", "Camera": "50MP + 5MP + 2MP", "Battery": "5000mAh, 25W"},
    [("color", "Blue Black", 0, 18, "#1c2d4f"), ("color", "Light Blue", 0, 12, "#9fb8d9")],
)
product(
    "Tecno Camon 30 Pro 5G", "android-phones", "Tecno", "device", "phone", 420000, 389000, 14, "N", "#2f3b35",
    "50MP camera with OIS, 144Hz AMOLED and 70W fast charge.",
    "Camon 30 Pro 5G is built for photography with a 50MP main camera and optical image stabilisation, a 6.78\" 144Hz AMOLED display and 70W fast charging.",
    {"Display": "6.78\" AMOLED, 144Hz", "RAM": "12GB", "Storage": "512GB", "Main camera": "50MP OIS", "Battery": "5000mAh, 70W", "Network": "5G"},
)
product(
    "Tecno Spark 20 Pro", "android-phones", "Tecno", "device", "phone", 235000, 214000, 26, "B", "#d6c28f",
    "108MP main camera, 120Hz display and 33W charging.",
    "A stylish everyday phone with a 108MP camera, smooth 120Hz display and 33W charging at a friendly price.",
    {"Display": "6.78\" FHD+, 120Hz", "RAM": "8GB", "Storage": "256GB", "Main camera": "108MP", "Battery": "5000mAh, 33W"},
)
product(
    "Infinix Hot 40i", "android-phones", "Infinix", "device", "phone", 158000, 145000, 40, "", "#3e6b5e",
    "6.56\" 90Hz display, 50MP camera and 5000mAh battery.",
    "Hot 40i delivers dependable everyday performance with a large 90Hz display, a 50MP camera and a long-lasting 5000mAh battery.",
    {"Display": "6.56\" HD+, 90Hz", "RAM": "8GB", "Storage": "128GB", "Camera": "50MP", "Battery": "5000mAh, 18W"},
)
product(
    "Infinix Note 40 Pro", "android-phones", "Infinix", "device", "phone", 365000, None, 12, "N", "#6b7f76",
    "Curved AMOLED, 108MP camera and 70W wireless-ready charging.",
    "Note 40 Pro pairs a curved 120Hz AMOLED display with a 108MP OIS camera and fast 70W charging for power users on a budget.",
    {"Display": "6.78\" curved AMOLED, 120Hz", "RAM": "12GB", "Storage": "256GB", "Camera": "108MP OIS", "Battery": "5000mAh, 70W"},
)
product(
    "Xiaomi Redmi Note 13 Pro", "android-phones", "Xiaomi", "device", "phone", 335000, 309000, 3, "", "#4a3a6b",
    "200MP camera, 1.5K AMOLED and 67W turbo charging.",
    "Redmi Note 13 Pro features a 200MP main camera with OIS, a crisp 1.5K 120Hz AMOLED display and 67W turbo charging.",
    {"Display": "6.67\" 1.5K AMOLED, 120Hz", "RAM": "8GB", "Storage": "256GB", "Main camera": "200MP OIS", "Battery": "5000mAh, 67W"},
)

# ------------------------------- Tablets -----------------------------------
product(
    "Apple iPad 10th Generation 64GB Wi-Fi", "tablets", "Apple", "device", "tablet", 650000, 598000, 10, "FB", "#4f7bd1",
    "10.9\" Liquid Retina, A14 Bionic, USB-C and landscape camera.",
    "The redesigned iPad features an all-screen 10.9\" Liquid Retina display, A14 Bionic, a landscape 12MP front camera and USB-C — perfect for school, work and play.",
    {"Display": "10.9\" Liquid Retina", "Chip": "A14 Bionic", "Storage": "64GB", "Connectivity": "Wi-Fi 6", "Port": "USB-C"},
    [("storage", "64GB", 0, 6, ""), ("storage", "256GB", 210000, 4, "")],
)
product(
    "Samsung Galaxy Tab A9+ 64GB", "tablets", "Samsung", "device", "tablet", 285000, 259000, 15, "", "#6b7280",
    "11\" 90Hz display, quad speakers and long battery life.",
    "A family-friendly tablet with an 11\" 90Hz display, quad speakers with Dolby Atmos and a slim metal design.",
    {"Display": "11\" WUXGA, 90Hz", "RAM": "4GB", "Storage": "64GB", "Battery": "7040mAh", "Audio": "Quad speakers"},
)

# ------------------------------- Laptops -----------------------------------
product(
    "HP 15 Laptop Core i5 13th Gen 8GB/512GB", "laptops", "HP", "computing", "laptop", 760000, 715000, 12, "FB", "#9aa3ad",
    "15.6\" FHD, Intel Core i5-1335U, 8GB RAM, 512GB SSD.",
    "A dependable everyday laptop with a 13th Gen Intel Core i5, fast 512GB SSD and a 15.6\" Full HD anti-glare display — ideal for students and professionals.",
    {"Processor": "Intel Core i5-1335U", "RAM": "8GB DDR4", "Storage": "512GB NVMe SSD", "Display": "15.6\" FHD anti-glare", "OS": "Windows 11 Home"},
    [("ram", "8GB", 0, 8, ""), ("ram", "16GB", 85000, 4, "")],
)
product(
    "Dell Latitude 5440 Core i7 16GB/512GB", "laptops", "Dell", "computing", "laptop", 1150000, None, 6, "", "#2f3640",
    "Business-class 14\" laptop with Core i7 and 16GB RAM.",
    "Latitude 5440 is built for business with a 13th Gen Intel Core i7, 16GB RAM, a comfortable keyboard and enterprise-grade manageability.",
    {"Processor": "Intel Core i7-1355U", "RAM": "16GB DDR4", "Storage": "512GB SSD", "Display": "14\" FHD", "OS": "Windows 11 Pro"},
)
product(
    "Lenovo IdeaPad Slim 3 Ryzen 5 8GB/512GB", "laptops", "Lenovo", "computing", "laptop", 680000, 629000, 9, "N", "#8a8f98",
    "Thin and light 15.6\" laptop with AMD Ryzen 5.",
    "A thin, light laptop with AMD Ryzen 5 performance, a 15.6\" Full HD display and rapid charge for long days on the go.",
    {"Processor": "AMD Ryzen 5 7520U", "RAM": "8GB LPDDR5", "Storage": "512GB SSD", "Display": "15.6\" FHD", "OS": "Windows 11 Home"},
)
product(
    "Apple MacBook Air 13\" M2 8GB/256GB", "macbooks", "Apple", "computing", "laptop", 1750000, 1620000, 7, "FB", "#c9ccd1",
    "Apple M2 chip, 13.6\" Liquid Retina and up to 18 hours of battery.",
    "The strikingly thin MacBook Air with the M2 chip, a 13.6\" Liquid Retina display, 1080p camera and MagSafe charging — silent, fanless and fast.",
    {"Chip": "Apple M2 (8-core CPU)", "Memory": "8GB unified", "Storage": "256GB SSD", "Display": "13.6\" Liquid Retina", "Battery": "Up to 18 hours"},
    [("ram", "8GB / 256GB", 0, 5, ""), ("ram", "16GB / 512GB", 380000, 2, "")],
)
product(
    "Apple MacBook Pro 14\" M3 8GB/512GB", "macbooks", "Apple", "computing", "laptop", 3100000, None, 2, "N", "#3a3d42",
    "M3 chip, Liquid Retina XDR display and pro connectivity.",
    "MacBook Pro 14\" with M3 delivers pro performance, a stunning Liquid Retina XDR display, HDMI, SDXC and MagSafe 3.",
    {"Chip": "Apple M3", "Memory": "8GB unified", "Storage": "512GB SSD", "Display": "14.2\" Liquid Retina XDR", "Ports": "2× Thunderbolt, HDMI, SDXC, MagSafe 3"},
)
product(
    "UGREEN Aluminium Laptop Stand", "laptop-accessories", "UGREEN", "accessory", "laptop", 24000, 19500, 35, "", "#c0c6ce",
    "Adjustable aluminium stand for 11\"–17\" laptops.",
    "Raise your screen to eye level for better posture. Sturdy aluminium with adjustable height and ventilation for cooler performance.",
    {"Material": "Aluminium alloy", "Compatibility": "11\" – 17\" laptops", "Adjustable": "Yes"},
)

# -------------------------- Desktops & monitors ----------------------------
product(
    "HP ProDesk 400 G9 Core i5 8GB/512GB", "desktop-computers", "HP", "computing", "desktop", 820000, None, 5, "", "#2f3640",
    "Compact business desktop with 12th Gen Core i5.",
    "A compact, secure business desktop with a 12th Gen Intel Core i5 and SSD storage for smooth office productivity.",
    {"Processor": "Intel Core i5-12500", "RAM": "8GB", "Storage": "512GB SSD", "Form factor": "Small form factor", "OS": "Windows 11 Pro"},
)
product(
    "Dell 24\" P2422H Full HD Monitor", "monitors", "Dell", "computing", "monitor", 235000, 215000, 11, "B", "#1f2937",
    "24\" IPS, height-adjustable stand, HDMI and DisplayPort.",
    "A comfortable 24\" Full HD IPS monitor with a fully adjustable stand, ComfortView Plus and slim bezels for multi-screen setups.",
    {"Size": "23.8\"", "Panel": "IPS", "Resolution": "1920 × 1080", "Ports": "HDMI, DisplayPort, VGA, USB hub", "Stand": "Height / tilt / swivel / pivot"},
)
product(
    "HP M22f 22\" FHD Monitor", "monitors", "HP", "computing", "monitor", 150000, 139000, 16, "", "#1f2937",
    "Ultra-slim 21.5\" IPS with AMD FreeSync.",
    "An ultra-slim 21.5\" IPS monitor with vivid colour, AMD FreeSync and eye-care technology for everyday work.",
    {"Size": "21.5\"", "Panel": "IPS", "Resolution": "1920 × 1080", "Refresh rate": "75Hz", "Ports": "HDMI, VGA"},
)

# ------------------------ Computer accessories -----------------------------
product(
    "Logitech MK270 Wireless Keyboard & Mouse Combo", "keyboards", "Logitech", "accessory", "keyboard", 38000, 33500, 28, "B", "#1f2937",
    "Reliable 2.4GHz wireless combo with long battery life.",
    "A full-size wireless keyboard and mouse with a tiny USB receiver, spill-resistant design and months of battery life.",
    {"Connection": "2.4GHz USB receiver", "Layout": "Full-size", "Battery life": "Keyboard up to 24 months"},
)
product(
    "Logitech G102 Lightsync Gaming Mouse", "mice", "Logitech", "gaming", "mouse", 29000, 25000, 30, "", "#111827",
    "8,000 DPI sensor, 6 programmable buttons and RGB.",
    "A lightweight wired gaming mouse with an 8,000 DPI sensor, six programmable buttons and customisable Lightsync RGB.",
    {"Sensor DPI": "200 – 8,000", "Buttons": "6 programmable", "Connection": "USB wired", "Lighting": "RGB"},
)
product(
    "Logitech C920 HD Pro Webcam", "computer-accessories", "Logitech", "accessory", "webcam", 125000, 112000, 5, "", "#111827",
    "Full HD 1080p video calls with stereo audio.",
    "Crisp 1080p video calls and recordings with automatic light correction and dual stereo microphones.",
    {"Resolution": "1080p / 30fps", "Microphones": "Dual stereo", "Mount": "Clip / tripod-ready", "Connection": "USB-A"},
)

# ---------------------------- Phone accessories ----------------------------
product(
    "Anker PowerCore 20000mAh Power Bank", "power-banks", "Anker", "power", "powerbank", 48000, 42000, 34, "FB", "#1f2937",
    "20,000mAh capacity with fast USB-C charging.",
    "Charge a phone multiple times with 20,000mAh of capacity, USB-C input/output and PowerIQ fast charging.",
    {"Capacity": "20,000mAh", "Output": "USB-C + USB-A", "Fast charging": "PowerIQ / 20W PD"},
    [("color", "Black", 0, 20, "#1f2937"), ("color", "White", 0, 14, "#e5e7eb")],
)
product(
    "Oraimo Traveler 4 20000mAh Power Bank", "power-banks", "Oraimo", "power", "powerbank", 29500, 26000, 45, "B", "#0f5132",
    "20,000mAh, 22.5W fast charging, dual output.",
    "An affordable high-capacity power bank with 22.5W fast charging and dual outputs to charge two devices at once.",
    {"Capacity": "20,000mAh", "Max output": "22.5W", "Ports": "USB-C in/out, 2× USB-A"},
)
product(
    "Apple 20W USB-C Power Adapter", "chargers", "Apple", "power", "charger", 39000, None, 22, "", "#f3f4f6",
    "Fast charging for iPhone and iPad.",
    "Compact 20W USB-C adapter for fast charging compatible iPhone and iPad models.",
    {"Output": "20W USB-C PD", "Compatibility": "iPhone 8 and later, iPad"},
)
product(
    "Anker Nano 30W GaN Charger", "chargers", "Anker", "power", "charger", 34000, 29500, 3, "N", "#e5e7eb",
    "Tiny 30W USB-C GaN charger for phones and tablets.",
    "A pocket-sized 30W USB-C charger using GaN technology — fast enough for phones, tablets and some ultrabooks.",
    {"Output": "30W USB-C PD", "Technology": "GaN"},
)
product(
    "Samsung 25W Super Fast Charger (USB-C)", "chargers", "Samsung", "power", "charger", 19500, 16500, 38, "B", "#111827",
    "25W PD Super Fast Charging for Galaxy devices.",
    "Charge compatible Galaxy devices quickly with 25W Super Fast Charging via USB-C Power Delivery.",
    {"Output": "25W USB-C PD", "Cable": "USB-C to C included"},
)
product(
    "UGREEN USB-C to USB-C 100W Cable 2m", "usb-cables", "UGREEN", "accessory", "cable", 12500, 10500, 60, "", "#374151",
    "Braided 100W cable for phones and laptops.",
    "A durable nylon-braided cable supporting up to 100W charging and 480Mbps data.",
    {"Length": "2m", "Power": "Up to 100W", "Jacket": "Nylon braided"},
)
product(
    "Baseus Lightning Fast-Charge Cable 1m", "lightning-cables", "Baseus", "accessory", "cable", 8500, 6900, 70, "", "#f3f4f6",
    "Reinforced Lightning cable for iPhone.",
    "A reinforced USB-A to Lightning cable with a durable jacket for everyday iPhone charging and syncing.",
    {"Length": "1m", "Connector": "USB-A to Lightning", "Current": "2.4A"},
)
product(
    "UGREEN iPad Stand & Holder", "ipad-accessories", "UGREEN", "accessory", "tablet", 16000, 13500, 25, "", "#9ca3af",
    "Adjustable desktop stand for iPad and tablets.",
    "A sturdy adjustable stand for iPad and tablets up to 12.9\" — great for video calls, recipes and reading.",
    {"Compatibility": "4\" – 12.9\" devices", "Material": "Aluminium alloy"},
)

# --------------------------------- Audio -----------------------------------
product(
    "Apple AirPods Pro (2nd Generation) USB-C", "earbuds", "Apple", "audio", "earbuds", 395000, 369000, 10, "FB", "#f3f4f6",
    "Active Noise Cancellation, Adaptive Audio and USB-C case.",
    "AirPods Pro deliver up to 2x more Active Noise Cancellation, Adaptive Audio, Transparency mode and personalised spatial audio with a USB-C MagSafe case.",
    {"Noise cancellation": "Active", "Battery": "Up to 6h (30h with case)", "Charging": "USB-C, MagSafe, Qi", "Water resistance": "IP54"},
)
product(
    "Oraimo FreePods 4 ANC Earbuds", "earbuds", "Oraimo", "audio", "earbuds", 38000, 32000, 50, "B", "#111827",
    "Active noise cancellation with 35.5-hour playtime.",
    "Affordable true wireless earbuds with active noise cancellation, deep bass and up to 35.5 hours total playtime.",
    {"Noise cancellation": "Active (ANC)", "Playtime": "Up to 35.5h with case", "Bluetooth": "5.3"},
)
product(
    "Oraimo Bluetooth Neckband Headset", "bluetooth-headsets", "Oraimo", "audio", "earbuds", 15500, 12900, 42, "", "#1f2937",
    "Lightweight neckband headset for calls and music.",
    "A comfortable, lightweight neckband headset with magnetic earbuds and clear calls.",
    {"Bluetooth": "5.3", "Playtime": "Up to 20h", "Microphone": "Built-in"},
)
product(
    "Sony WH-1000XM5 Wireless Headphones", "headphones", "Sony", "audio", "headphones", 560000, 519000, 4, "F", "#1f2937",
    "Industry-leading noise cancelling with 30-hour battery.",
    "Premium over-ear headphones with exceptional noise cancellation, crystal-clear calls and up to 30 hours of battery life.",
    {"Noise cancellation": "Active, auto-optimising", "Battery": "Up to 30h", "Charging": "USB-C (3 min = 3h)", "Codecs": "SBC, AAC, LDAC"},
    [("color", "Black", 0, 2, "#1f2937"), ("color", "Silver", 0, 2, "#d1d5db")],
)
product(
    "JBL Tune 520BT Wireless Headphones", "headphones", "JBL", "audio", "headphones", 62000, 54000, 20, "", "#1d4ed8",
    "JBL Pure Bass sound with 57-hour battery.",
    "Lightweight on-ear headphones with JBL Pure Bass sound, multipoint connection and up to 57 hours of playtime.",
    {"Battery": "Up to 57h", "Bluetooth": "5.3 LE Audio", "Multipoint": "Yes"},
)
product(
    "JBL Flip 6 Portable Speaker", "bluetooth-speakers", "JBL", "audio", "speaker", 155000, 139000, 14, "FB", "#1d4ed8",
    "Bold sound, IP67 waterproof and 12-hour playtime.",
    "Powerful JBL Original Pro Sound in a compact, IP67 waterproof and dustproof speaker with up to 12 hours of playtime.",
    {"Battery": "Up to 12h", "Waterproof": "IP67", "PartyBoost": "Yes"},
    [("color", "Blue", 0, 6, "#1d4ed8"), ("color", "Black", 0, 5, "#111827"), ("color", "Red", 0, 3, "#b91c1c")],
)
product(
    "JBL Charge 5 Portable Speaker", "bluetooth-speakers", "JBL", "audio", "speaker", 225000, None, 0, "", "#111827",
    "Big sound, IP67 and a built-in power bank.",
    "JBL Charge 5 delivers bold sound with a separate tweeter, 20 hours of playtime and a built-in power bank to charge your devices.",
    {"Battery": "Up to 20h", "Waterproof": "IP67", "Powerbank": "Yes"},
)
product(
    "Oraimo SoundPro Bluetooth Speaker", "bluetooth-speakers", "Oraimo", "audio", "speaker", 27000, 22500, 33, "N", "#374151",
    "Portable speaker with deep bass and 12-hour battery.",
    "A compact, portable speaker with punchy bass, TWS pairing and up to 12 hours of playtime.",
    {"Battery": "Up to 12h", "Bluetooth": "5.3", "TWS pairing": "Yes"},
)

# ------------------------------- Wearables ---------------------------------
product(
    "Samsung Galaxy Watch6 44mm", "smart-watches", "Samsung", "wearable", "watch", 345000, 310000, 8, "F", "#1f2937",
    "Advanced health tracking, sleep coaching and sapphire crystal.",
    "Galaxy Watch6 brings a larger, brighter display, advanced sleep coaching, heart-rate and body composition insights in a slim design.",
    {"Display": "1.5\" Super AMOLED", "Case": "44mm aluminium", "Water resistance": "5ATM + IP68", "Battery": "Up to 40h"},
)
product(
    "Xiaomi Redmi Watch 4", "smart-watches", "Xiaomi", "wearable", "watch", 98000, 86000, 17, "N", "#9ca3af",
    "1.97\" AMOLED, GPS and up to 20-day battery.",
    "A large 1.97\" AMOLED smartwatch with built-in GPS, 150+ workout modes and up to 20 days of battery life.",
    {"Display": "1.97\" AMOLED", "GPS": "Built-in", "Battery": "Up to 20 days", "Water resistance": "5ATM"},
)
product(
    "Xiaomi Smart Band 8", "smart-bands", "Xiaomi", "wearable", "band", 46000, 39500, 29, "B", "#111827",
    "AMOLED fitness band with 16-day battery.",
    "Track workouts, sleep and heart rate with a bright AMOLED screen and up to 16 days of battery life.",
    {"Display": "1.62\" AMOLED", "Battery": "Up to 16 days", "Water resistance": "5ATM"},
)

# -------------------------------- Storage ----------------------------------
product(
    "SanDisk Ultra microSDXC 128GB", "memory-cards", "SanDisk", "storage", "memorycard", 16000, 13500, 80, "B", "#9b1c1c",
    "Up to 140MB/s, A1 rated, for phones and tablets.",
    "Extra storage for phones and tablets with fast transfer speeds and A1 app performance.",
    {"Capacity": "128GB", "Read speed": "Up to 140MB/s", "Class": "UHS-I, U1, A1"},
    [("capacity", "64GB", -6000, 40, ""), ("capacity", "128GB", 0, 30, ""), ("capacity", "256GB", 12000, 10, "")],
)
product(
    "SanDisk Extreme SDXC 64GB", "memory-cards", "SanDisk", "storage", "memorycard", 29000, None, 14, "", "#b45309",
    "4K UHD video recording for cameras.",
    "Shoot 4K UHD video and burst photos with fast write speeds built for DSLR and mirrorless cameras.",
    {"Capacity": "64GB", "Read speed": "Up to 170MB/s", "Class": "UHS-I, U3, V30"},
)
product(
    "Kingston DataTraveler Exodia 64GB USB 3.2", "flash-drives", "Kingston", "storage", "flashdrive", 9500, 7900, 90, "", "#1f2937",
    "Portable USB 3.2 flash drive with key loop.",
    "A reliable, affordable USB 3.2 flash drive with a protective cap and key loop.",
    {"Capacity": "64GB", "Interface": "USB 3.2 Gen 1"},
)
product(
    "SanDisk Ultra Dual Drive USB-C 128GB", "flash-drives", "SanDisk", "storage", "flashdrive", 17500, 15000, 36, "N", "#6b7280",
    "USB-C and USB-A in one drive for phones and PCs.",
    "Move files between USB-C phones, tablets and computers with a reversible dual-connector drive.",
    {"Capacity": "128GB", "Connectors": "USB-C + USB-A", "Read speed": "Up to 400MB/s"},
)
product(
    "Seagate Expansion 2TB Portable Hard Drive", "external-hard-drives", "Seagate", "storage", "hdd", 118000, 105000, 13, "B", "#111827",
    "2TB USB 3.0 portable drive for backups.",
    "Plug-and-play 2TB portable storage for backing up documents, photos and videos.",
    {"Capacity": "2TB", "Interface": "USB 3.0", "Compatibility": "Windows, macOS (reformat)"},
)
product(
    "Samsung T7 Portable SSD 1TB", "ssds", "Samsung", "storage", "ssd", 170000, 155000, 9, "F", "#1e3a8a",
    "Up to 1,050MB/s in a pocket-sized aluminium body.",
    "Fast, compact portable SSD with read speeds up to 1,050MB/s and shock-resistant aluminium design.",
    {"Capacity": "1TB", "Interface": "USB 3.2 Gen 2 (10Gbps)", "Read speed": "Up to 1,050MB/s"},
)
product(
    "Kingston NV2 1TB NVMe M.2 SSD", "ssds", "Kingston", "storage", "ssd", 98000, 89000, 18, "", "#1f2937",
    "PCIe 4.0 NVMe upgrade for laptops and desktops.",
    "Upgrade laptops and desktops with fast PCIe 4.0 NVMe storage for quicker boots and app launches.",
    {"Capacity": "1TB", "Form factor": "M.2 2280", "Interface": "PCIe 4.0 x4 NVMe", "Read speed": "Up to 3,500MB/s"},
)

# ------------------------------- Networking --------------------------------
product(
    "TP-Link Archer C6 AC1200 Dual-Band Router", "wi-fi-routers", "TP-Link", "networking", "router", 57000, 51000, 19, "B", "#f3f4f6",
    "Dual-band Wi-Fi with MU-MIMO and gigabit ports.",
    "Fast, reliable dual-band Wi-Fi for homes and small offices with four antennas, MU-MIMO and gigabit ports.",
    {"Wi-Fi": "AC1200 dual-band", "Ports": "4× Gigabit LAN, 1× Gigabit WAN", "Antennas": "4 external + 1 internal"},
)
product(
    "TP-Link Deco M4 Mesh Wi-Fi (2-Pack)", "wi-fi-routers", "TP-Link", "networking", "router", 155000, 139000, 7, "F", "#f3f4f6",
    "Whole-home mesh Wi-Fi coverage.",
    "Eliminate dead zones with seamless whole-home mesh coverage and easy app setup.",
    {"Wi-Fi": "AC1200 mesh", "Coverage": "Up to 3,800 sq ft (2-pack)", "Ports": "2 Gigabit per unit"},
)
product(
    "Huawei E5576 4G MiFi", "mifi", "Huawei", "networking", "mifi", 46000, 41000, 24, "B", "#f3f4f6",
    "Pocket 4G hotspot for up to 16 devices.",
    "Share 4G internet with up to 16 devices anywhere with a slim, pocketable MiFi and 1500mAh battery.",
    {"Network": "4G LTE Cat4", "Users": "Up to 16", "Battery": "1500mAh"},
)
product(
    "TP-Link M7200 4G LTE MiFi", "mifi", "TP-Link", "networking", "mifi", 56000, None, 2, "", "#111827",
    "4G LTE mobile Wi-Fi with 8-hour battery.",
    "A portable 4G LTE hotspot with up to 8 hours of battery life and easy app management.",
    {"Network": "4G LTE Cat4", "Users": "Up to 10", "Battery": "2000mAh"},
)
product(
    "Huawei B311 4G Router", "modems", "Huawei", "networking", "modem", 78000, 72000, 11, "", "#f3f4f6",
    "Plug-and-play 4G home broadband router.",
    "Insert a SIM and share 4G internet across your home or office with Wi-Fi and an Ethernet port.",
    {"Network": "4G LTE Cat4", "Wi-Fi": "802.11b/g/n", "Users": "Up to 32", "Ports": "1× LAN/WAN"},
)
product(
    "TP-Link TL-WN725N USB Wi-Fi Adapter", "networking-devices", "TP-Link", "networking", "adapter", 9500, 8200, 50, "", "#111827",
    "Nano USB adapter to add Wi-Fi to any PC.",
    "Add 150Mbps Wi-Fi to a desktop or laptop with a nano-sized USB adapter.",
    {"Speed": "150Mbps", "Interface": "USB 2.0", "Size": "Nano"},
)
product(
    "UGREEN Cat6 Ethernet Cable 20m", "network-cables", "UGREEN", "networking", "cable", 9000, None, 40, "", "#2563eb",
    "Gigabit Cat6 patch cable for routers and PCs.",
    "A long Cat6 patch cable for stable gigabit wired connections between routers, switches and computers.",
    {"Category": "Cat6", "Length": "20m", "Speed": "Up to 1Gbps"},
)

# ------------------------------ Security -----------------------------------
product(
    "Hikvision 4-Channel 1080p CCTV Kit", "cctv-security", "Hikvision", "security", "camera", 295000, 270000, 6, "", "#f3f4f6",
    "4 cameras + DVR with night vision and mobile viewing.",
    "A complete 4-camera 1080p CCTV kit with DVR, infrared night vision and remote viewing from your phone.",
    {"Cameras": "4× 1080p (2MP)", "Recorder": "4-channel DVR", "Night vision": "Up to 20m IR", "Storage": "HDD not included"},
)

# -------------------------------- Gaming -----------------------------------
product(
    "Sony DualSense Wireless Controller", "gamepads", "Sony", "gaming", "gamepad", 125000, 115000, 12, "F", "#f3f4f6",
    "Haptic feedback, adaptive triggers and built-in mic.",
    "Feel the action with haptic feedback and adaptive triggers, plus a built-in microphone and USB-C charging.",
    {"Connection": "Bluetooth, USB-C", "Features": "Haptics, adaptive triggers", "Compatibility": "PS5, PC"},
    [("color", "White", 0, 8, "#f3f4f6"), ("color", "Midnight Black", 0, 4, "#111827")],
)
product(
    "Xbox Wireless Controller", "gamepads", "Microsoft", "gaming", "gamepad", 95000, 88000, 10, "", "#111827",
    "Textured grip and Bluetooth for Xbox, PC and mobile.",
    "The modernised Xbox controller with textured grips, a hybrid D-pad and Bluetooth for Xbox, Windows and mobile.",
    {"Connection": "Xbox Wireless, Bluetooth, USB-C", "Compatibility": "Xbox Series X|S, Xbox One, Windows, Android, iOS"},
)
product(
    "Logitech G435 Lightspeed Gaming Headset", "gaming-accessories", "Logitech", "gaming", "headphones", 85000, 74000, 9, "N", "#1d4ed8",
    "Ultra-light wireless gaming headset.",
    "An ultra-lightweight wireless gaming headset with Lightspeed and Bluetooth, built-in beamforming mics and 18-hour battery.",
    {"Connection": "Lightspeed 2.4GHz + Bluetooth", "Weight": "165g", "Battery": "Up to 18h"},
)

# ---------------------------- Other categories -----------------------------
product(
    "Ruizu X02 8GB MP3/MP4 Player", "mp3-mp4-players", "Ruizu", "audio", "mp3", 19000, 16500, 20, "", "#111827",
    "Compact media player with FM radio and voice recorder.",
    "A compact MP3/MP4 player with 8GB storage, FM radio, voice recorder and microSD expansion.",
    {"Storage": "8GB (microSD up to 128GB)", "Display": "1.8\" TFT", "Extras": "FM radio, voice recorder"},
)
product(
    "Kaspersky Standard 1 Device / 1 Year", "software-antivirus", "Kaspersky", "software", "software", 18500, 15500, 100, "", "#15803d",
    "Real-time antivirus and online protection.",
    "Real-time protection against viruses, ransomware and phishing for one Windows, macOS or Android device for one year.",
    {"Devices": "1", "Duration": "1 year", "Platforms": "Windows, macOS, Android, iOS"},
)
product(
    "APC Back-UPS 1200VA", "power-backup", "APC", "power", "ups", 145000, 135000, 8, "B", "#111827",
    "Battery backup and surge protection for PCs and routers.",
    "Keep computers, routers and CCTV running through short outages with battery backup and surge-protected outlets.",
    {"Capacity": "1200VA / 650W", "Outlets": "6", "Surge protection": "Yes"},
)
product(
    "Ulanzi MT-08 Mini Tripod", "digital-camera-accessories", "Ulanzi", "accessory", "lens", 14500, 12000, 32, "", "#111827",
    "Compact tripod and selfie grip for phones and cameras.",
    "An extendable mini tripod and handle for phones, compact cameras and vlogging setups with a cold-shoe mount.",
    {"Max load": "1kg", "Height": "Extends to 21cm", "Mount": "1/4\" screw + cold shoe"},
)

PRODUCTS = P

SAMPLE_REVIEWERS = [
    ("Adaeze", "Okafor"), ("Tunde", "Bakare"), ("Chinedu", "Eze"), ("Funmilayo", "Adeyemi"),
    ("Ibrahim", "Musa"), ("Ngozi", "Nwosu"), ("Segun", "Ogunleye"), ("Amaka", "Obi"),
]

SAMPLE_REVIEW_TEXT = {
    5: [
        ("Exactly as described", "Brand new, sealed and exactly what I ordered. Delivery to my office was quick too."),
        ("Very happy", "Works perfectly. The staff explained everything and followed up after delivery."),
        ("Great value", "Compared prices around Computer Village and this was fair. Quality is solid."),
    ],
    4: [
        ("Good product", "Does the job well. Packaging could be better but the product itself is great."),
        ("Recommended", "Solid build and performs as expected. Took a day longer to arrive than I hoped."),
    ],
    3: [("Okay overall", "It works fine for the price, but battery life is a bit shorter than I expected.")],
}

COUPONS = [
    ("WELCOME10", "percentage", 10, 20000, 20000, "10% off your first order (max ₦20,000)."),
    ("TIMELINE5K", "fixed", 5000, 100000, None, "₦5,000 off orders above ₦100,000."),
]

const PROVIDER_PHOTOS = {
  "Dingin Jaya Teknik": {
    "category": "ac_service",
    "path": "/providers/ac_service.webp"
  },
  "Sejuk Prima Service": {
    "category": "ac_service",
    "path": "/providers/ac_service_script_clear.webp"
  },
  "Rapi AC Care": {
    "category": "ac_service",
    "path": "/providers/ac_service_script_detail.webp"
  },
  "Putar Jaya Elektronik": {
    "category": "washer",
    "path": "/providers/washer.webp"
  },
  "Bersih Putar Service": {
    "category": "washer",
    "path": "/providers/washer_script_clear.webp"
  },
  "Rapi Washer Care": {
    "category": "washer",
    "path": "/providers/washer_script_detail.webp"
  },
  "Tirta Ledeng": {
    "category": "plumbing",
    "path": "/providers/plumbing.webp"
  },
  "Pipa Prima Service": {
    "category": "plumbing",
    "path": "/providers/plumbing_script_clear.webp"
  },
  "Rapi Plumbing Care": {
    "category": "plumbing",
    "path": "/providers/plumbing_script_detail.webp"
  },
  "Terang Listrik": {
    "category": "electrical",
    "path": "/providers/electrical.webp"
  },
  "Arus Prima Service": {
    "category": "electrical",
    "path": "/providers/electrical_script_clear.webp"
  },
  "Rapi Electrical Care": {
    "category": "electrical",
    "path": "/providers/electrical_script_detail.webp"
  },
  "Kinclong Home Care": {
    "category": "cleaning",
    "path": "/providers/cleaning.webp"
  },
  "Bersih Prima Home": {
    "category": "cleaning",
    "path": "/providers/cleaning_script_clear.webp"
  },
  "Rapi Home Care": {
    "category": "cleaning",
    "path": "/providers/cleaning_script_detail.webp"
  }
};

export function providerPhoto(name, category) {
  const photo = Object.hasOwn(PROVIDER_PHOTOS, name) ? PROVIDER_PHOTOS[name] : null;
  return photo?.category === category ? photo.path : null;
}

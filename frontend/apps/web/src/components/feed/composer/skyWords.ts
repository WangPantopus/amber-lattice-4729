// Every word the Sky's approximate places put in the Pulse composer (phase A, contract section 10.2), kept in one
// place so a change of words is one edit. Drawn only while GET /api/posts/place-eligibility answers `sky: true`.
export const SKY_WORDS = {
  /** "Floating over Camas, WA". */
  floatingOver: (area: string) => `Floating over ${area}`,
  /** "At Esther Short Park". */
  at: (place: string) => `At ${place}`,
  pinAtPlace: 'Pin it at a place',
  photoTakenHere: 'Photo taken here',
  /** A venue tagged and a photo taken there: the post pins exactly. */
  photoPins: 'Your photo was taken here, so you can post to this place. Your post will say “Photo taken here.”',
  /** An address or a bare photo: the post floats. */
  photoFloats: 'Your photo was taken here. The post floats over the area.',
};

// What a post's place tag names, as the server reads it (backend/utils/postPlaceTag.js): a town or an area, an address,
// or anything else, a venue. Under the Sky only a venue keeps an exact pin.
const AREA_PLACE_KINDS = new Set(['place', 'locality', 'neighborhood', 'district', 'region', 'postcode', 'country',
  'city', 'town', 'village', 'hamlet', 'suburb', 'county', 'state']);
const ADDRESS_PLACE_KINDS = new Set(['address', 'street', 'house']);

export function taggedPlaceKind(placeId?: string | null, kind?: string | null): 'venue' | 'address' | 'area' | null {
  if (!placeId) return null;
  for (const name of [String(kind || '').toLowerCase(), String(placeId).split('.')[0].toLowerCase()]) {
    if (ADDRESS_PLACE_KINDS.has(name)) return 'address';
    if (AREA_PLACE_KINDS.has(name)) return 'area';
  }
  return 'venue';
}

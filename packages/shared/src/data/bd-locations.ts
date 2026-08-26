/**
 * Bangladesh administrative geography: 8 divisions → 64 districts → areas.
 *
 * This is static reference data rather than a Mongo collection, for three
 * reasons: it does not change, the web client can populate its district and area
 * dropdowns without a round-trip, and the matching scorer can walk the
 * division→district tree synchronously while scoring a candidate in memory.
 *
 * "Area" means thana/neighbourhood inside the two metropolitan districts (Dhaka
 * and Chattogram, where a district-level match is far too coarse to be useful)
 * and upazila elsewhere. Reports also accept a free-text `locationDescription`
 * for anything this list cannot express — and that field is owner-only, so the
 * public view never narrows below the area named here. See §11 of the blueprint.
 */

export const DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
] as const;
export type Division = (typeof DIVISIONS)[number];

export interface DistrictEntry {
  readonly district: string;
  readonly division: Division;
  readonly areas: readonly string[];
}

export const BD_DISTRICTS: readonly DistrictEntry[] = Object.freeze([
  /* ───────────────────────────────────────────────────────── Dhaka division */
  {
    district: 'Dhaka',
    division: 'Dhaka',
    // Dhaka city thanas, then the district's non-city upazilas. Anyone reporting
    // a loss in Dhaka needs neighbourhood granularity — "Dhaka" alone covers
    // twenty million people.
    areas: [
      'Adabor', 'Airport', 'Badda', 'Banani', 'Bangshal', 'Bashundhara',
      'Bhashantek', 'Cantonment', 'Chawkbazar', 'Dakshinkhan', 'Darus Salam',
      'Demra', 'Dhanmondi', 'Gendaria', 'Gulshan', 'Hazaribagh', 'Jatrabari',
      'Kafrul', 'Kalabagan', 'Kamrangirchar', 'Khilgaon', 'Khilkhet', 'Kotwali',
      'Lalbagh', 'Mirpur', 'Mohammadpur', 'Motijheel', 'Mugda', 'New Market',
      'Pallabi', 'Paltan', 'Ramna', 'Rampura', 'Sabujbagh', 'Shah Ali',
      'Shahbagh', 'Sher-e-Bangla Nagar', 'Shyampur', 'Sutrapur', 'Tejgaon',
      'Turag', 'Uttara', 'Uttarkhan', 'Vatara', 'Wari',
      'Dhamrai', 'Dohar', 'Keraniganj', 'Nawabganj', 'Savar',
    ],
  },
  {
    district: 'Gazipur',
    division: 'Dhaka',
    areas: ['Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur', 'Tongi'],
  },
  {
    district: 'Narayanganj',
    division: 'Dhaka',
    areas: ['Araihazar', 'Bandar', 'Narayanganj Sadar', 'Rupganj', 'Sonargaon', 'Siddhirganj', 'Fatullah'],
  },
  {
    district: 'Narsingdi',
    division: 'Dhaka',
    areas: ['Belabo', 'Monohardi', 'Narsingdi Sadar', 'Palash', 'Raipura', 'Shibpur'],
  },
  {
    district: 'Tangail',
    division: 'Dhaka',
    areas: [
      'Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur',
      'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur', 'Tangail Sadar',
    ],
  },
  {
    district: 'Kishoreganj',
    division: 'Dhaka',
    areas: [
      'Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj',
      'Katiadi', 'Kishoreganj Sadar', 'Kuliarchar', 'Mithamain', 'Nikli', 'Pakundia', 'Tarail',
    ],
  },
  {
    district: 'Manikganj',
    division: 'Dhaka',
    areas: ['Daulatpur', 'Ghior', 'Harirampur', 'Manikganj Sadar', 'Saturia', 'Shibalaya', 'Singair'],
  },
  {
    district: 'Munshiganj',
    division: 'Dhaka',
    areas: ['Gazaria', 'Lohajang', 'Munshiganj Sadar', 'Sirajdikhan', 'Sreenagar', 'Tongibari'],
  },
  {
    district: 'Faridpur',
    division: 'Dhaka',
    areas: [
      'Alfadanga', 'Bhanga', 'Boalmari', 'Charbhadrasan', 'Faridpur Sadar',
      'Madhukhali', 'Nagarkanda', 'Sadarpur', 'Saltha',
    ],
  },
  {
    district: 'Gopalganj',
    division: 'Dhaka',
    areas: ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'],
  },
  {
    district: 'Madaripur',
    division: 'Dhaka',
    areas: ['Kalkini', 'Madaripur Sadar', 'Rajoir', 'Shibchar', 'Dasar'],
  },
  {
    district: 'Rajbari',
    division: 'Dhaka',
    areas: ['Baliakandi', 'Goalandaghat', 'Kalukhali', 'Pangsha', 'Rajbari Sadar'],
  },
  {
    district: 'Shariatpur',
    division: 'Dhaka',
    areas: ['Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Shariatpur Sadar', 'Zanjira'],
  },

  /* ──────────────────────────────────────────────────── Chattogram division */
  {
    district: 'Chattogram',
    division: 'Chattogram',
    // City thanas first, then the district's upazilas.
    areas: [
      'Agrabad', 'Bakalia', 'Bandar', 'Bayezid', 'Chandgaon', 'Chawkbazar',
      'Double Mooring', 'EPZ', 'Halishahar', 'Khulshi', 'Kotwali', 'Pahartali',
      'Panchlaish', 'Patenga', 'Sadarghat',
      'Anowara', 'Banshkhali', 'Boalkhali', 'Chandanaish', 'Fatikchhari',
      'Hathazari', 'Karnaphuli', 'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia',
      'Raozan', 'Sandwip', 'Satkania', 'Sitakunda',
    ],
  },
  {
    district: "Cox's Bazar",
    division: 'Chattogram',
    areas: [
      'Chakaria', "Cox's Bazar Sadar", 'Kutubdia', 'Maheshkhali', 'Ramu',
      'Teknaf', 'Ukhia', 'Pekua',
    ],
  },
  {
    district: 'Cumilla',
    division: 'Chattogram',
    areas: [
      'Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram',
      'Cumilla Adarsha Sadar', 'Cumilla Sadar Dakshin', 'Daudkandi', 'Debidwar',
      'Homna', 'Laksam', 'Meghna', 'Monohorgonj', 'Muradnagar', 'Nangalkot', 'Titas',
    ],
  },
  {
    district: 'Brahmanbaria',
    division: 'Chattogram',
    areas: [
      'Akhaura', 'Ashuganj', 'Bancharampur', 'Bijoynagar', 'Brahmanbaria Sadar',
      'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail',
    ],
  },
  {
    district: 'Chandpur',
    division: 'Chattogram',
    areas: [
      'Chandpur Sadar', 'Faridganj', 'Haimchar', 'Haziganj', 'Kachua',
      'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti',
    ],
  },
  {
    district: 'Noakhali',
    division: 'Chattogram',
    areas: [
      'Begumganj', 'Chatkhil', 'Companiganj', 'Hatiya', 'Kabirhat',
      'Noakhali Sadar', 'Senbagh', 'Sonaimuri', 'Subarnachar',
    ],
  },
  {
    district: 'Feni',
    division: 'Chattogram',
    areas: ['Chhagalnaiya', 'Daganbhuiyan', 'Feni Sadar', 'Fulgazi', 'Parshuram', 'Sonagazi'],
  },
  {
    district: 'Lakshmipur',
    division: 'Chattogram',
    areas: ['Kamalnagar', 'Lakshmipur Sadar', 'Raipur', 'Ramganj', 'Ramgati'],
  },
  {
    district: 'Rangamati',
    division: 'Chattogram',
    areas: [
      'Bagaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai',
      'Kawkhali', 'Langadu', 'Naniarchar', 'Rajasthali', 'Rangamati Sadar',
    ],
  },
  {
    district: 'Khagrachhari',
    division: 'Chattogram',
    areas: [
      'Dighinala', 'Khagrachhari Sadar', 'Lakshmichhari', 'Mahalchhari',
      'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh',
    ],
  },
  {
    district: 'Bandarban',
    division: 'Chattogram',
    areas: ['Alikadam', 'Bandarban Sadar', 'Lama', 'Naikhongchhari', 'Rowangchhari', 'Ruma', 'Thanchi'],
  },

  /* ────────────────────────────────────────────────────── Rajshahi division */
  {
    district: 'Rajshahi',
    division: 'Rajshahi',
    areas: [
      'Boalia', 'Motihar', 'Rajpara', 'Shah Makhdum',
      'Bagha', 'Bagmara', 'Charghat', 'Durgapur', 'Godagari', 'Mohanpur',
      'Paba', 'Puthia', 'Tanore',
    ],
  },
  {
    district: 'Bogura',
    division: 'Rajshahi',
    areas: [
      'Adamdighi', 'Bogura Sadar', 'Dhunat', 'Dhupchanchia', 'Gabtali',
      'Kahaloo', 'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur',
      'Shibganj', 'Sonatala',
    ],
  },
  {
    district: 'Pabna',
    division: 'Rajshahi',
    areas: [
      'Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur', 'Ishwardi',
      'Pabna Sadar', 'Santhia', 'Sujanagar',
    ],
  },
  {
    district: 'Sirajganj',
    division: 'Rajshahi',
    areas: [
      'Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj',
      'Shahjadpur', 'Sirajganj Sadar', 'Tarash', 'Ullapara',
    ],
  },
  {
    district: 'Natore',
    division: 'Rajshahi',
    areas: ['Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Naldanga', 'Natore Sadar', 'Singra'],
  },
  {
    district: 'Naogaon',
    division: 'Rajshahi',
    areas: [
      'Atrai', 'Badalgachhi', 'Dhamoirhat', 'Manda', 'Mohadevpur',
      'Naogaon Sadar', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar',
    ],
  },
  {
    district: 'Joypurhat',
    division: 'Rajshahi',
    areas: ['Akkelpur', 'Joypurhat Sadar', 'Kalai', 'Khetlal', 'Panchbibi'],
  },
  {
    district: 'Chapai Nawabganj',
    division: 'Rajshahi',
    areas: ['Bholahat', 'Gomastapur', 'Nachole', 'Chapai Nawabganj Sadar', 'Shibganj'],
  },

  /* ───────────────────────────────────────────────────────── Khulna division */
  {
    district: 'Khulna',
    division: 'Khulna',
    areas: [
      'Daulatpur', 'Khalishpur', 'Khan Jahan Ali', 'Kotwali', 'Sonadanga',
      'Batiaghata', 'Dacope', 'Dighalia', 'Dumuria', 'Koyra', 'Paikgachha',
      'Phultala', 'Rupsha', 'Terokhada',
    ],
  },
  {
    district: 'Jashore',
    division: 'Khulna',
    areas: [
      'Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jhikargachha', 'Keshabpur',
      'Jashore Sadar', 'Manirampur', 'Sharsha',
    ],
  },
  {
    district: 'Kushtia',
    division: 'Khulna',
    areas: ['Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Kushtia Sadar', 'Mirpur'],
  },
  {
    district: 'Satkhira',
    division: 'Khulna',
    areas: ['Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Satkhira Sadar', 'Shyamnagar', 'Tala'],
  },
  {
    district: 'Bagerhat',
    division: 'Khulna',
    areas: [
      'Bagerhat Sadar', 'Chitalmari', 'Fakirhat', 'Kachua', 'Mollahat',
      'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola',
    ],
  },
  {
    district: 'Jhenaidah',
    division: 'Khulna',
    areas: ['Harinakunda', 'Jhenaidah Sadar', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'],
  },
  {
    district: 'Chuadanga',
    division: 'Khulna',
    areas: ['Alamdanga', 'Chuadanga Sadar', 'Damurhuda', 'Jibannagar'],
  },
  {
    district: 'Magura',
    division: 'Khulna',
    areas: ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'],
  },
  {
    district: 'Narail',
    division: 'Khulna',
    areas: ['Kalia', 'Lohagara', 'Narail Sadar'],
  },
  {
    district: 'Meherpur',
    division: 'Khulna',
    areas: ['Gangni', 'Meherpur Sadar', 'Mujibnagar'],
  },

  /* ──────────────────────────────────────────────────────── Barishal division */
  {
    district: 'Barishal',
    division: 'Barishal',
    areas: [
      'Barishal Sadar', 'Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara',
      'Gaurnadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur',
    ],
  },
  {
    district: 'Patuakhali',
    division: 'Barishal',
    areas: [
      'Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara',
      'Mirzaganj', 'Patuakhali Sadar', 'Rangabali',
    ],
  },
  {
    district: 'Bhola',
    division: 'Barishal',
    areas: ['Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan', 'Manpura', 'Tazumuddin'],
  },
  {
    district: 'Pirojpur',
    division: 'Barishal',
    areas: ['Bhandaria', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Nesarabad', 'Pirojpur Sadar', 'Zianagar'],
  },
  {
    district: 'Barguna',
    division: 'Barishal',
    areas: ['Amtali', 'Bamna', 'Barguna Sadar', 'Betagi', 'Patharghata', 'Taltali'],
  },
  {
    district: 'Jhalokati',
    division: 'Barishal',
    areas: ['Jhalokati Sadar', 'Kathalia', 'Nalchity', 'Rajapur'],
  },

  /* ───────────────────────────────────────────────────────── Sylhet division */
  {
    district: 'Sylhet',
    division: 'Sylhet',
    areas: [
      'Ambarkhana', 'Zindabazar', 'Subid Bazar', 'Uposhohor',
      'Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Dakshin Surma',
      'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat',
      'Osmani Nagar', 'Sylhet Sadar', 'Zakiganj',
    ],
  },
  {
    district: 'Moulvibazar',
    division: 'Sylhet',
    areas: ['Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Moulvibazar Sadar', 'Rajnagar', 'Sreemangal'],
  },
  {
    district: 'Habiganj',
    division: 'Sylhet',
    areas: [
      'Ajmiriganj', 'Bahubal', 'Baniachong', 'Chunarughat', 'Habiganj Sadar',
      'Lakhai', 'Madhabpur', 'Nabiganj', 'Shayestaganj',
    ],
  },
  {
    district: 'Sunamganj',
    division: 'Sylhet',
    areas: [
      'Bishwamvarpur', 'Chhatak', 'Derai', 'Dharampasha', 'Dowarabazar',
      'Jagannathpur', 'Jamalganj', 'Sulla', 'Sunamganj Sadar', 'Tahirpur', 'Madhyanagar',
    ],
  },

  /* ──────────────────────────────────────────────────────── Rangpur division */
  {
    district: 'Rangpur',
    division: 'Rangpur',
    areas: [
      'Badarganj', 'Gangachara', 'Kaunia', 'Mithapukur', 'Pirgachha',
      'Pirganj', 'Rangpur Sadar', 'Taraganj',
    ],
  },
  {
    district: 'Dinajpur',
    division: 'Rangpur',
    areas: [
      'Birampur', 'Birganj', 'Birol', 'Bochaganj', 'Chirirbandar',
      'Dinajpur Sadar', 'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama',
      'Nawabganj', 'Parbatipur', 'Phulbari',
    ],
  },
  {
    district: 'Gaibandha',
    division: 'Rangpur',
    areas: ['Fulchhari', 'Gaibandha Sadar', 'Gobindaganj', 'Palashbari', 'Sadullapur', 'Saghata', 'Sundarganj'],
  },
  {
    district: 'Kurigram',
    division: 'Rangpur',
    areas: [
      'Bhurungamari', 'Char Rajibpur', 'Chilmari', 'Kurigram Sadar',
      'Nageshwari', 'Phulbari', 'Rajarhat', 'Raumari', 'Ulipur',
    ],
  },
  {
    district: 'Nilphamari',
    division: 'Rangpur',
    areas: ['Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Nilphamari Sadar', 'Saidpur'],
  },
  {
    district: 'Lalmonirhat',
    division: 'Rangpur',
    areas: ['Aditmari', 'Hatibandha', 'Kaliganj', 'Lalmonirhat Sadar', 'Patgram'],
  },
  {
    district: 'Thakurgaon',
    division: 'Rangpur',
    areas: ['Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail', 'Thakurgaon Sadar'],
  },
  {
    district: 'Panchagarh',
    division: 'Rangpur',
    areas: ['Atwari', 'Boda', 'Debiganj', 'Panchagarh Sadar', 'Tetulia'],
  },

  /* ─────────────────────────────────────────────────────── Mymensingh division */
  {
    district: 'Mymensingh',
    division: 'Mymensingh',
    areas: [
      'Bhaluka', 'Dhobaura', 'Fulbaria', 'Gaffargaon', 'Gauripur',
      'Haluaghat', 'Ishwarganj', 'Muktagachha', 'Mymensingh Sadar',
      'Nandail', 'Phulpur', 'Tarakanda', 'Trishal',
    ],
  },
  {
    district: 'Jamalpur',
    division: 'Mymensingh',
    areas: ['Bakshiganj', 'Dewanganj', 'Islampur', 'Jamalpur Sadar', 'Madarganj', 'Melandaha', 'Sarishabari'],
  },
  {
    district: 'Netrokona',
    division: 'Mymensingh',
    areas: [
      'Atpara', 'Barhatta', 'Durgapur', 'Kalmakanda', 'Kendua',
      'Khaliajuri', 'Madan', 'Mohanganj', 'Netrokona Sadar', 'Purbadhala',
    ],
  },
  {
    district: 'Sherpur',
    division: 'Mymensingh',
    areas: ['Jhenaigati', 'Nakla', 'Nalitabari', 'Sherpur Sadar', 'Sreebardi'],
  },
]);

/* ------------------------------------------------------------------ lookups */

/**
 * Built once at module load. Lookups happen inside the scoring loop — once per
 * candidate pair — so they must not be linear scans over 64 districts.
 */
const DISTRICT_INDEX: ReadonlyMap<string, DistrictEntry> = new Map(
  BD_DISTRICTS.map((entry) => [entry.district.toLowerCase(), entry]),
);

export const DISTRICT_NAMES: readonly string[] = Object.freeze(
  BD_DISTRICTS.map((d) => d.district),
);

/** The division a district belongs to, or `null` if the name is unrecognised. */
export function divisionForDistrict(district: string): Division | null {
  return DISTRICT_INDEX.get(district.trim().toLowerCase())?.division ?? null;
}

/** Areas within a district; empty when the district is unrecognised. */
export function areasForDistrict(district: string): readonly string[] {
  return DISTRICT_INDEX.get(district.trim().toLowerCase())?.areas ?? [];
}

export function isKnownDistrict(district: string): boolean {
  return DISTRICT_INDEX.has(district.trim().toLowerCase());
}

/**
 * Is `area` a recognised area of `district`?
 *
 * Case- and whitespace-insensitive. Reports are not rejected for an unknown
 * area — people know their neighbourhood better than any fixed list — but the
 * scorer only awards the exact-area bonus when both sides name the same known
 * one, so an unrecognised value falls back to district-level matching.
 */
export function isKnownArea(district: string, area: string): boolean {
  const needle = area.trim().toLowerCase();
  return areasForDistrict(district).some((a) => a.toLowerCase() === needle);
}

/** Districts grouped by division, for a grouped `<select>`. */
export function districtsByDivision(): Record<Division, string[]> {
  const out = Object.fromEntries(DIVISIONS.map((d) => [d, [] as string[]])) as Record<
    Division,
    string[]
  >;
  for (const entry of BD_DISTRICTS) out[entry.division].push(entry.district);
  return out;
}

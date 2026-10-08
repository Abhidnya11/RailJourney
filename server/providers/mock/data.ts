import type { Station } from '../../../shared/domain.js';

export interface MockTrainDef {
  number: string;
  name: string;
  scenario: 'ON_TIME' | 'DELAYED' | 'AHEAD' | 'STALE' | 'CANCELLED' | 'NOT_STARTED' | 'COMPLETED';
  /** 0..1 offset into the demo cycle, so trains are not all at the same place. */
  phase: number;
  stations: Omit<Station, 'sequence'>[];
}

const s = (id: string, code: string, name: string, latitude: number, longitude: number, km: number) => ({
  id,
  code,
  name,
  latitude,
  longitude,
  distanceFromStartKm: km,
});

const DELHI_MUMBAI = [
  s('NDLS', 'NDLS', 'New Delhi', 28.6428, 77.2197, 0),
  s('MTJ', 'MTJ', 'Mathura Junction', 27.4833, 77.6742, 141),
  s('KOTA', 'KOTA', 'Kota Junction', 25.1818, 75.8449, 465),
  s('RTM', 'RTM', 'Ratlam Junction', 23.3315, 75.0367, 689),
  s('BRC', 'BRC', 'Vadodara Junction', 22.3105, 73.1812, 933),
  s('ST', 'ST', 'Surat', 21.2049, 72.8402, 1136),
  s('BCT', 'BCT', 'Mumbai Central', 18.9696, 72.8193, 1384),
];

const HOWRAH_CHENNAI = [
  s('HWH', 'HWH', 'Howrah Junction', 22.5839, 88.3426, 0),
  s('KGP', 'KGP', 'Kharagpur Junction', 22.3396, 87.3209, 116),
  s('BBS', 'BBS', 'Bhubaneswar', 20.2503, 85.8394, 439),
  s('VSKP', 'VSKP', 'Visakhapatnam', 17.7228, 83.2899, 877),
  s('BZA', 'BZA', 'Vijayawada Junction', 16.5185, 80.6196, 1117),
  s('MAS', 'MAS', 'Chennai Central', 13.0827, 80.2757, 1662),
];

const DELHI_KOLKATA = [
  s('NDLS', 'NDLS', 'New Delhi', 28.6428, 77.2197, 0),
  s('CNB', 'CNB', 'Kanpur Central', 26.4540, 80.3507, 440),
  s('PRYJ', 'PRYJ', 'Prayagraj Junction', 25.4452, 81.8244, 634),
  s('DDU', 'DDU', 'Pt. Deen Dayal Upadhyaya Jn', 25.2800, 83.1200, 780),
  s('GAYA', 'GAYA', 'Gaya Junction', 24.7955, 85.0043, 996),
  s('HWH', 'HWH', 'Howrah Junction', 22.5839, 88.3426, 1450),
];

export const MOCK_TRAINS: MockTrainDef[] = [
  { number: '12952', name: 'Mumbai Rajdhani Express', scenario: 'DELAYED', phase: 0.42, stations: DELHI_MUMBAI },
  { number: '12951', name: 'Mumbai Central Rajdhani', scenario: 'ON_TIME', phase: 0.15, stations: DELHI_MUMBAI },
  { number: '12301', name: 'Howrah Rajdhani Express', scenario: 'AHEAD', phase: 0.6, stations: DELHI_KOLKATA },
  { number: '12841', name: 'Coromandel Express', scenario: 'DELAYED', phase: 0.3, stations: HOWRAH_CHENNAI },
  { number: '12839', name: 'Howrah Chennai Mail', scenario: 'STALE', phase: 0.5, stations: HOWRAH_CHENNAI },
  { number: '12009', name: 'Shatabdi Express (Cancelled)', scenario: 'CANCELLED', phase: 0, stations: DELHI_MUMBAI },
  { number: '12627', name: 'Karnataka Express (Not Started)', scenario: 'NOT_STARTED', phase: 0, stations: DELHI_KOLKATA },
  { number: '12260', name: 'Duronto Express (Completed)', scenario: 'COMPLETED', phase: 0.99, stations: HOWRAH_CHENNAI },
];

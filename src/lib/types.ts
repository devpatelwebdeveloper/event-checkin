export interface Registrant {
  id: number;
  timestamp_raw: string | null;
  email: string | null;
  full_name: string;
  contact_number: string | null;
  address: string | null;
  total_family_count: number;
  family_member_names: string | null;
  heard_about_event: string | null;
  referred_by: string | null;

  checked_in: boolean;
  checked_in_count: number | null;
  checked_in_by: number | null;
  checked_in_by_name?: string | null; // joined from users table
  checked_in_at: string | null;

  is_walkin: boolean;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: number;
  registrant_id: number;
  name: string;
  phone: string | null;
  is_primary: boolean;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: number | null;
}

export interface CheckinMember {
  id: number | null;  // null for newly added members
  name?: string;      // required when id is null
  present: boolean;
  phone: string | null;
}

export interface Stats {
  total_registrants: number;
  total_expected_people: number; // sum of total_family_count
  checked_in_registrations: number;
  checked_in_people: number; // sum of checked_in_count
  pending_registrations: number;
}

export interface UserRow {
  id: number;
  name: string;
  email: string;
  role: "admin" | "registrar" | "viewer";
  created_at: string;
}

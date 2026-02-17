export interface CharacterMeta {
  name: string;
  rank: string;
  image: string;
  class: string;
  archetype: string;
  race: string;
  subrace?: string;
  background: string;
  level: number;
  origin: string;
  age: string;
  job: string;
  clearance: string;
  comm: string;
}

export interface Attributes {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  hp_curr: number;
  hp_max: number;
  hp_temp: number;
  ac: number;
  speed_mod: number; // Legacy, kept for safety
  speed: number; // New Base Speed
  passive_perception_mod: number; // New Passive Perception Modifier
  shield_curr: number;
  shield_max: number;
}

export interface Saves {
  prof_str: boolean;
  prof_dex: boolean;
  prof_con: boolean;
  prof_int: boolean;
  prof_wis: boolean;
  prof_cha: boolean;
  [key: string]: boolean; // Index signature for dynamic access
}

// v12 Skill format: [Proficiency(bool), Expertise(bool), Bonus(number)]
export type SkillTuple = [boolean, boolean, number];

export interface Skills {
  // Key is skill code (e.g., 'athletics'), value is the tuple
  data: Record<string, SkillTuple>; 
  bonuses: Record<string, number>; // Legacy or extra bonuses
}

export interface Item {
  name: string;
  desc?: string;
  type?: string;
  isHeader?: boolean; // New for subgroups
  [key: string]: any;
}

export interface Spell {
  name: string;
  time: string;
  range: string;
  conc: boolean;
  dur: string;
  cost: number;
  desc: string;
}

export interface Combat {
  weapons: Item[];
  inventory: Item[];
}

export interface Profs {
  langs: string[];
  tools: string[];
  armory: string[];
}

export interface Money {
  u: number;
  k: number;
  m: number;
  g: number;
}

export interface Psych {
  size: string;
  age: string;
  height: string;
  weight: string;
  trait: string;
  ideal: string;
  bond: string;
  flaw: string;
  analysis: string;
}

export interface Psionics {
  base_attr: 'int' | 'wis' | 'cha';
  caster_type: '1' | '0.5' | '0.33';
  class_lvl: number; // Now calculated, but stored for compatibility/caching if needed
  mod_points: number;
  points_curr: number;
  spells: Spell[];
}

export interface Counter {
  name: string;
  val: number;
  max: number;
}

export interface Universalis {
  save_base: number;
  save_attr: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  custom_table: Item[];
  counters: Counter[];
}

export interface Character {
  id: string;
  meta: CharacterMeta;
  stats: Attributes;
  saves: Saves;
  skills: Skills;
  combat: Combat;
  abilities: Item[];
  traits: Item[];
  features: Item[];
  profs: Profs;
  money: Money;
  psych: Psych;
  psionics: Psionics;
  universalis: Universalis;
  locks?: Record<string, boolean>;
}

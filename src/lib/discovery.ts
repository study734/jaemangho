export interface DiscoveryPerson {
  name: string;
  userId: string | null;
  image: string | null;
}

export interface DiscoveryCard {
  id: string;
  kind: 'moment' | 'highlight' | 'award' | 'play';
  label: string;
  title: string;
  result: string;
  reason: string;
  source: string;
  at: string | null;
  href: string;
  action: string;
  people: DiscoveryPerson[];
  motif: string;
  metric: string;
  context: string;
  comparison?: { usual: number; current: number; samples: number };
}

export interface DiscoveryFeed {
  cards: DiscoveryCard[];
  unavailable: boolean;
}

import { z } from 'zod';

export const EVENT_CATEGORIES = [
  'party',
  'music',
  'sport',
  'arts',
  'culture',
  'academic',
  'career',
  'wellness',
  'other',
] as const;
export const eventCategorySchema = z.enum(EVENT_CATEGORIES, 'Choose a category');
export type EventCategory = z.infer<typeof eventCategorySchema>;

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  party: 'Parties',
  music: 'Music',
  sport: 'Sport',
  arts: 'Arts',
  culture: 'Culture',
  academic: 'Academic',
  career: 'Career',
  wellness: 'Wellness',
  other: 'Other',
};

/** Stored status. "Ended" is not stored: it's a published event whose end time has passed. */
export const EVENT_STATUSES = ['draft', 'published', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const MAX_PRICE_CENTS = 1_000_000; // R10 000
export const MAX_CAPACITY = 50_000;

/** What an admin submits to create or edit an event. Times are UTC ISO strings. */
export const eventInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Use at least 3 characters')
      .max(120, 'Keep it under 120 characters'),
    description: z.string().trim().max(5000, 'Keep it under 5000 characters').default(''),
    category: eventCategorySchema,
    venue: z.string().trim().min(2, 'Where is it?').max(120, 'Keep it under 120 characters'),
    startsAt: z.iso.datetime({ offset: true, message: 'Choose a start date and time' }),
    endsAt: z.iso.datetime({ offset: true, message: 'Choose an end date and time' }),
    capacity: z
      .number('Enter how many people can attend')
      .int('Use a whole number')
      .min(1, 'At least 1 person')
      .max(MAX_CAPACITY, `At most ${MAX_CAPACITY.toLocaleString('en-ZA')}`),
    priceCents: z
      .number('Enter a price, or 0 for free')
      .int()
      .min(0, 'Price can’t be negative')
      .max(MAX_PRICE_CENTS, 'At most R10 000'),
    volunteersWanted: z.boolean().default(false),
  })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), {
    path: ['endsAt'],
    message: 'The end must be after the start',
  });
export type EventInput = z.infer<typeof eventInputSchema>;

export const cancelEventSchema = z.object({
  reason: z.string().trim().min(5, 'Tell attendees why (at least 5 characters)').max(500),
});
export type CancelEventInput = z.infer<typeof cancelEventSchema>;

export const PRICE_FILTERS = ['free', 'paid'] as const;
export const WHEN_FILTERS = ['upcoming', 'this-week', 'this-month', 'past'] as const;
export type WhenFilter = (typeof WHEN_FILTERS)[number];

/** Query string for the public event list. Unknown values fall back to defaults instead of erroring. */
export const eventListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: eventCategorySchema.optional().catch(undefined),
  price: z.enum(PRICE_FILTERS).optional().catch(undefined),
  when: z.enum(WHEN_FILTERS).default('upcoming').catch('upcoming'),
  page: z.coerce.number().int().min(1).max(1000).default(1).catch(1),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const adminEventListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(EVENT_STATUSES).optional().catch(undefined),
});
export type AdminEventListQuery = z.infer<typeof adminEventListQuerySchema>;

/** Card-sized view of an event (Discover grid, admin list). */
export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  category: EventCategory;
  venue: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  capacity: number;
  /** Valid and used tickets. Spots left = capacity - ticketsSold. */
  ticketsSold: number;
  likeCount: number;
  status: EventStatus;
  coverUrl: string | null;
}

export interface EventDetail extends EventSummary {
  description: string;
  volunteersWanted: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
  /** The signed-in student's active ticket for this event, if any. */
  myTicketId: string | null;
  /** Whether the signed-in viewer has liked this event. */
  likedByMe: boolean;
}

export interface AdminEvent extends EventDetail {
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventPage {
  events: EventSummary[];
  /** Next page number, or null when this is the last page. */
  nextPage: number | null;
}

export const EVENT_PAGE_SIZE = 24;

/** Cover uploads: what the API accepts. */
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

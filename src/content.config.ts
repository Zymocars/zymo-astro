// Astro Content Collections config
// Defines typed schemas for every migrated SEO content collection.
// Migration source of truth: zymo-backend/functions/seo/*
// Populated by scripts/migrate-*.mjs one-shot migration scripts.

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// -----------------------------------------------------------------------------
// FAQ item — shared shape across cities, guides, answers, modifiers
// -----------------------------------------------------------------------------
const FaqItem = z.object({
  q: z.string(),
  a: z.string(),
});

// -----------------------------------------------------------------------------
// Cities — /self-drive-car-rental-in-{city}
// Source: zymo-backend/functions/seo/cityContent.js CITY_SEO_CONTENT[{slug}]
//         + cityData.json + cityFaqs.js + reviewData.js
// -----------------------------------------------------------------------------
const cities = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cities' }),
  schema: z.object({
    slug: z.string(),
    cityName: z.string(),

    // Meta / SEO
    title: z.string(),
    description: z.string(),
    canonical: z.string().url().optional(),
    heroImage: z.string().optional(),         // deprecated 2026-07-19 — cartoon hero images killed for brand + CWV
    heroAlt: z.string().optional(),

    // Answer block — spoken/AEO
    answerBlock: z.string(),

    // Body content (from CITY_SEO_CONTENT[slug])
    intro: z.string(),
    popularAreas: z.array(z.string()),
    nearbyDestinations: z.array(z.string()),
    tips: z.string(),
    carTypes: z.string(),
    whyZymo: z.string(),
    howItWorks: z.string(),
    priceNote: z.string(),
    faqs: z.array(FaqItem),

    // FAQs from cityFaqs.js (separate from the intro faqs above — legacy structure)
    additionalFaqs: z.array(FaqItem).optional(),

    // Reviews from reviewData.js
    reviews: z.array(z.object({
      name: z.string(),
      stars: z.number().min(1).max(5),
      body: z.string(),
      source: z.string().optional(),
      date: z.string().optional(),
    })).optional(),

    // Optional per-city extras
    airportInfo: z.object({
      code: z.string(),
      name: z.string(),
      terminals: z.array(z.object({
        name: z.string(),
        pickupLocation: z.string(),
        notes: z.string().optional(),
      })),
      tip: z.string().optional(),
    }).optional(),

    pickupAreas: z.array(z.object({
      name: z.string(),
      areas: z.string(),
      description: z.string(),
    })).optional(),

    roadTripsTable: z.array(z.object({
      destination: z.string(),
      distanceKm: z.number(),
      driveTime: z.string(),
      highlights: z.string(),
      slug: z.string().optional(),           // for internal link if a route page exists
    })).optional(),

    // Internal-link hub structure
    internalLinks: z.array(z.object({
      path: z.string(),
      label: z.string(),
    })).optional(),

    // Schema.org overrides
    aggregateRating: z.object({
      value: z.number(),
      count: z.number(),
    }).optional(),

    // -----------------------------------------------------------------------
    // Extended fields (Session 96 — Astro parity closure with prod)
    // -----------------------------------------------------------------------

    // H1 override — template falls back to `Self-Drive Car Rental in ${cityName}` if absent
    h1: z.string().optional(),

    // Geo coordinates for LocalBusiness + Place schemas — from metaConfigs.CITY_GEO
    geo: z.object({
      lat: z.number(),
      lng: z.number(),
      state: z.string(),
    }).optional(),

    // Pricing per class — from cityData.json .pricing — used for AggregateOffer schema
    pricing: z.object({
      hatchback: z.string().optional(),
      sedan: z.string().optional(),
      suv: z.string().optional(),
    }).partial().optional(),

    // HowTo schema steps — from metaConfigs.HOWTO_SCHEMAS[`self-drive-car-rental-${slug}`].step
    howToSteps: z.array(z.object({
      name: z.string(),
      text: z.string(),
      url: z.string().optional(),
    })).optional(),

    // SpeakableSpecification selectors for WebPage schema
    speakableSelectors: z.array(z.string()).optional(),

    // OG image filename (path relative to /images/CityCars&Price/) — from metaConfigs.CITY_OG_IMAGES
    ogImageFile: z.string().optional(),

    // Route links for "Drive from {city}" section (max 4) — from ROUTE_DATA filtered on citySlug-to-*
    routeLinks: z.array(z.object({
      label: z.string(),
      path: z.string(),
    })).max(4).optional(),

    // Useful resources for "Useful Resources for Driving in {city}" section — from CITY_RESOURCES
    usefulResources: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).optional(),

    // Modifier internal-link block for "More Car Rental Options in {city}"
    moreOptions: z.array(z.object({
      label: z.string(),
      path: z.string(),
    })).optional(),

    // Citation sources from answersContent.js CITATION_SOURCES
    citationSources: z.array(z.object({
      label: z.string(),
      url: z.string(),
    })).optional(),

    // -----------------------------------------------------------------------
    // Byte-parity safety net (Session 96)
    // -----------------------------------------------------------------------

    // Pre-rendered HTML body from cityContent.generateCityContentHtml(slug).
    // Emitted via <Fragment set:html={bodyHtml}> — guarantees byte-parity with prod
    // while structured fields above allow future template-driven rewrite.
    bodyHtml: z.string().optional(),

    // Pre-computed JSON-LD schema array from metaConfigs.getCityPageSchemas(slug, cityName).
    // Each entry is a plain object; template emits <script type="application/ld+json">
    // for each. Same reason as bodyHtml — guaranteed schema parity.
    schemas: z.array(z.unknown()).optional(),

    // Deprecated on prod (fake ratings pulled 2026-04-27) — keep field to catch
    // any migration that accidentally re-introduces booking-count claims.
    __denyBookingCountClaims: z.literal(true).default(true),
  }),
});

// -----------------------------------------------------------------------------
// Guides — /guides/{slug}
// Source: zymo-backend/functions/seo/guideContent.js + metaConfigs.js
//         GUIDE_PAGE_CONFIGS
// -----------------------------------------------------------------------------
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    h1: z.string(),
    // "pillar" = long-form comprehensive guide; "spoke" = comparison / narrow topic
    type: z.enum(['pillar', 'spoke']),
    publishedDate: z.string(),               // YYYY-MM-DD
    modifiedDate: z.string(),                // YYYY-MM-DD
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    // Raw HTML body from guideContent.js generators — rendered via Fragment set:html
    // in the Astro template. Includes inline styles matching the SSR shell.
    bodyHtml: z.string(),
    faqs: z.array(FaqItem).optional(),
    articleSection: z.string().optional(),
    keywords: z.string().optional(),
  }),
});

// -----------------------------------------------------------------------------
// Answers — /answers/{slug}
// Source: zymo-backend/functions/seo/answersContent.js
// -----------------------------------------------------------------------------
const answers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/answers' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    h1: z.string(),
    publishedDate: z.string().optional(),
    modifiedDate: z.string().optional(),
    bodyHtml: z.string(),
    faqs: z.array(FaqItem).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Modifiers — /cheap-car-rental-in-{city}, /airport-car-rental-in-{city}, ...
// Source: zymo-backend/functions/seo/modifierConfigs.js + nationalModifierConfigs.js
// -----------------------------------------------------------------------------
const modifiers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/modifiers' }),
  schema: z.object({
    modifierSlug: z.enum(['cheap', 'airport', 'weekend', 'monthly']),
    citySlug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    intro: z.string().optional(),
    bodyHtml: z.string(),
    faqs: z.array(FaqItem).optional(),
  }),
});

// -----------------------------------------------------------------------------
// National landing pages — /self-drive-car-rental-india, /cheap-car-rental-india, ...
// Source: zymo-backend/functions/seo/landingContent.js
// -----------------------------------------------------------------------------
const national = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/national' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    heroImage: z.string().optional(),
    intro: z.string().optional(),
    body: z.string(),
    faqs: z.array(FaqItem).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Route pages — /self-drive-{from}-to-{to}
// Source: zymo-backend/functions/seo/routeConfigs.js + routeClassConfigs.js
// -----------------------------------------------------------------------------
const routes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/routes' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
    faqs: z.array(FaqItem).optional(),
    // Pre-computed JSON-LD schemas from routeConfigs.getRouteSchemas + getRouteFAQSchema
    // (BreadcrumbList + TouristTrip with nested ItemList + TouristDestinations + AggregateOffer + Speakable + FAQPage).
    // Template emits verbatim to guarantee byte-parity with prod SSR route pages.
    schemas: z.array(z.unknown()).optional(),
  }),
});

// -----------------------------------------------------------------------------
// ZoomCar cluster pages — /zoomcar-car-rental-in-{city}
// Source: zymo-backend/functions/seo/zoomcarConfigs.js + zoomcarClusterContent.js
// -----------------------------------------------------------------------------
const zoomcarClusters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/zoomcar-clusters' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
    faqs: z.array(FaqItem).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Partner acquisition pages — /partner, /partner/faq, /partner/blog/{slug}
// Source: zymo-backend/functions/seo/partnerContent.js
// -----------------------------------------------------------------------------
const partner = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/partner' }),
  schema: z.object({
    slug: z.string(),
    kind: z.enum(['landing', 'faq', 'earn']),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
    // Pre-computed JSON-LD schemas from partnerContent.js + metaConfigs.js
    // (FAQPage with Question/Answer + Service[] + Offer[] on /partner/faq;
    // HowTo + landing schemas on /partner).
    schemas: z.array(z.unknown()).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Research pages — /research/{slug}
// Source: zymo-backend/functions/seo/researchContent.js + researchCharts.js
// -----------------------------------------------------------------------------
const research = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
    // Pre-computed JSON-LD schemas from metaConfigs.getResearchSchemas
    // (ScholarlyArticle + DataDownload[] + WebPage + Speakable + Place + ListItem).
    schemas: z.array(z.unknown()).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Static pages — /about-us, /faqs, /terms-of-service, /founder, /press, ...
// -----------------------------------------------------------------------------
const staticPages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/static-pages' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
  }),
});

// -----------------------------------------------------------------------------
// Homepage — single-entry collection for `/`
// Source: zymo-backend/functions/seo/homeContent.js generateHomepageContentHtml
// -----------------------------------------------------------------------------
const homepage = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/homepage' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    canonical: z.string().url(),
    bodyHtml: z.string(),
    // Pre-computed JSON-LD schemas from metaConfigs (getHomepageFAQSchema,
    // getRentalHowToSchema, getWebSiteSchema, getMobileAppSchema).
    // Template emits verbatim to match prod schema-type set on `/`.
    schemas: z.array(z.unknown()).optional(),
  }),
});

// -----------------------------------------------------------------------------
// Register
// -----------------------------------------------------------------------------
export const collections = {
  homepage,
  cities,
  guides,
  answers,
  modifiers,
  national,
  routes,
  zoomcarClusters,
  partner,
  research,
  staticPages,
};

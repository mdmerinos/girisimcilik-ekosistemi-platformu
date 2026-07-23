import { z } from "zod";

import { fetchWithRetry } from "@/lib/ingestion/fetchWithRetry";
import { createUniqueKey } from "@/lib/utils/createUniqueKey";
import { normalizeText } from "@/lib/utils/normalizeText";
import type { OpportunityCategory, OpportunityInput } from "@/types/opportunity";

export const SOCIAL_MEDIA_PLATFORMS = [
  "youtube",
  "instagram",
  "x",
  "linkedin",
] as const;

export type SocialMediaPlatform = (typeof SOCIAL_MEDIA_PLATFORMS)[number];
export type SocialMediaAccessMode = "api" | "public" | "fragile";

export const SOCIAL_MEDIA_KEYWORDS = [
  "girişim",
  "girişimci",
  "startup",
  "kuluçka",
  "incubation",
  "hızlandırma",
  "accelerator",
  "yatırım",
  "investment",
  "fon",
  "funding",
  "hibe",
  "destek",
  "support",
  "çağrı",
  "call",
  "başvuru",
  "application",
  "etkinlik",
  "event",
  "program",
] as const;

export type SocialMediaSourceDefinition = {
  sourceSlug: string;
  displayName: string;
  platform: SocialMediaPlatform;
  officialAccountUrl: string;
  relatedTechnopark: string;
  accessMode: SocialMediaAccessMode;
  enabled: boolean;
  keywords: string[];
  requiredEnv: string[];
  channelId?: string;
  username?: string;
  accountIdEnv?: string;
  organizationUrnEnv?: string;
};

const commonKeywords = [...SOCIAL_MEDIA_KEYWORDS];

export const socialMediaSourceDefinitions: SocialMediaSourceDefinition[] = [
  {
    sourceSlug: "itu-ari-youtube",
    displayName: "İTÜ ARI Teknokent · YouTube",
    platform: "youtube",
    officialAccountUrl:
      "https://www.youtube.com/channel/UCteH62Js8Q3QlnZktqd85_g",
    relatedTechnopark: "İTÜ ARI Teknokent",
    accessMode: "api",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: ["YOUTUBE_DATA_API_KEY"],
    channelId: "UCteH62Js8Q3QlnZktqd85_g",
  },
  {
    sourceSlug: "itu-ari-instagram",
    displayName: "İTÜ ARI Teknokent · Instagram",
    platform: "instagram",
    officialAccountUrl: "https://www.instagram.com/ariteknokent/",
    relatedTechnopark: "İTÜ ARI Teknokent",
    accessMode: "api",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: [
      "META_INSTAGRAM_ACCESS_TOKEN",
      "META_INSTAGRAM_ITU_ARI_ACCOUNT_ID",
    ],
    accountIdEnv: "META_INSTAGRAM_ITU_ARI_ACCOUNT_ID",
  },
  {
    sourceSlug: "itu-ari-x",
    displayName: "İTÜ ARI Teknokent · X",
    platform: "x",
    officialAccountUrl: "https://x.com/ariteknokent",
    relatedTechnopark: "İTÜ ARI Teknokent",
    accessMode: "api",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: ["X_BEARER_TOKEN"],
    username: "ariteknokent",
  },
  {
    sourceSlug: "itu-ari-linkedin",
    displayName: "İTÜ ARI Teknokent · LinkedIn",
    platform: "linkedin",
    officialAccountUrl: "https://www.linkedin.com/company/ituariteknokent",
    relatedTechnopark: "İTÜ ARI Teknokent",
    accessMode: "fragile",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: [
      "LINKEDIN_ACCESS_TOKEN",
      "LINKEDIN_ITU_ARI_ORGANIZATION_URN",
    ],
    organizationUrnEnv: "LINKEDIN_ITU_ARI_ORGANIZATION_URN",
  },
  {
    sourceSlug: "odtu-teknokent-x",
    displayName: "ODTÜ TEKNOKENT · X",
    platform: "x",
    officialAccountUrl: "https://x.com/ODTUTEKNOKENT",
    relatedTechnopark: "ODTÜ Teknokent",
    accessMode: "api",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: ["X_BEARER_TOKEN"],
    username: "ODTUTEKNOKENT",
  },
  {
    sourceSlug: "odtu-teknokent-linkedin",
    displayName: "ODTÜ TEKNOKENT · LinkedIn",
    platform: "linkedin",
    officialAccountUrl:
      "https://www.linkedin.com/company/odtuteknokentyonetim",
    relatedTechnopark: "ODTÜ Teknokent",
    accessMode: "fragile",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: [
      "LINKEDIN_ACCESS_TOKEN",
      "LINKEDIN_ODTU_TEKNOKENT_ORGANIZATION_URN",
    ],
    organizationUrnEnv: "LINKEDIN_ODTU_TEKNOKENT_ORGANIZATION_URN",
  },
  {
    sourceSlug: "teknopark-istanbul-linkedin",
    displayName: "Teknopark İstanbul · LinkedIn",
    platform: "linkedin",
    officialAccountUrl: "https://www.linkedin.com/company/teknoparkistanbul",
    relatedTechnopark: "Teknopark İstanbul",
    accessMode: "fragile",
    enabled: true,
    keywords: commonKeywords,
    requiredEnv: [
      "LINKEDIN_ACCESS_TOKEN",
      "LINKEDIN_TEKNOPARK_ISTANBUL_ORGANIZATION_URN",
    ],
    organizationUrnEnv:
      "LINKEDIN_TEKNOPARK_ISTANBUL_ORGANIZATION_URN",
  },
];

export type RawSocialMediaPost = {
  id: string;
  text: string;
  title?: string | null;
  publishedAt: string | null;
  sourceUrl: string;
  imageUrl?: string | null;
};

function comparable(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesSocialMediaKeywords(
  value: string,
  keywords: string[],
): boolean {
  const normalized = comparable(value);
  return keywords.some((keyword) => normalized.includes(comparable(keyword)));
}

function titleFromPost(post: RawSocialMediaPost): string {
  const candidate = normalizeText(post.title || post.text.split(/\r?\n/)[0]);
  if (candidate.length <= 180) return candidate;
  return `${candidate.slice(0, 177).trim()}…`;
}

function categoryFromPost(value: string): OpportunityCategory {
  const normalized = comparable(value);
  if (/\b(yatirim|investment|seed|venture|funding round)\b/.test(normalized)) {
    return "Yatırım ve Sermaye Ağları";
  }
  if (/\b(fon|hibe|destek|support|cagri|call|grant)\b/.test(normalized)) {
    return "Ulusal Destek ve Fonlar";
  }
  if (
    /\b(kulucka|incubation|hizlandirma|accelerator|basvuru|application|etkinlik|event|program)\b/.test(
      normalized,
    )
  ) {
    return "Etkinlik ve Programlar";
  }
  return "Haber ve Sosyal Medya Akışı";
}

function applicationUrlFromText(text: string, fallback: string): string {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const candidate = match[0].replace(/[.,;:!?]+$/, "");
    if (URL.canParse(candidate)) return candidate;
  }
  return fallback;
}

export function mapSocialMediaPost(
  source: SocialMediaSourceDefinition,
  post: RawSocialMediaPost,
  fetchedAt = new Date().toISOString(),
): OpportunityInput {
  const title = titleFromPost(post);
  return {
    unique_key: createUniqueKey(
      source.relatedTechnopark,
      post.sourceUrl,
      title,
    ),
    title,
    summary: normalizeText(post.text) || null,
    category: categoryFromPost(`${title} ${post.text}`),
    source_name: source.relatedTechnopark,
    source_url: post.sourceUrl,
    application_url: applicationUrlFromText(post.text, post.sourceUrl),
    image_url: post.imageUrl ?? null,
    published_at: post.publishedAt,
    deadline_at: null,
    fetched_at: fetchedAt,
    location: "Türkiye",
    is_featured: false,
    platform: source.platform,
    related_technopark: source.relatedTechnopark,
  };
}

type FetchJson = (
  url: string,
  init?: RequestInit,
) => Promise<unknown>;

async function defaultFetchJson(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetchWithRetry(url, {
    ...init,
    timeoutMs: 8_000,
    retries: 1,
  });
  return response.json();
}

type SocialCollectorDependencies = {
  env?: NodeJS.ProcessEnv;
  fetchJson?: FetchJson;
  now?: () => Date;
};

const youtubeSchema = z.object({
  items: z.array(
    z.object({
      id: z.object({ videoId: z.string() }),
      snippet: z.object({
        title: z.string(),
        description: z.string().default(""),
        publishedAt: z.string(),
        thumbnails: z
          .object({
            high: z.object({ url: z.string() }).optional(),
            medium: z.object({ url: z.string() }).optional(),
          })
          .optional(),
      }),
    }),
  ),
});

const instagramSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      caption: z.string().default(""),
      permalink: z.string(),
      timestamp: z.string(),
      media_url: z.string().nullable().optional(),
      thumbnail_url: z.string().nullable().optional(),
    }),
  ),
});

const xUserSchema = z.object({ data: z.object({ id: z.string() }) });
const xPostsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string().nullable().optional(),
        note_tweet: z.object({ text: z.string() }).optional(),
      }),
    )
    .default([]),
});

const linkedInSchema = z.object({
  elements: z
    .array(
      z.object({
        id: z.string(),
        commentary: z.string().default(""),
        publishedAt: z.number().nullable().optional(),
      }),
    )
    .default([]),
});

async function collectRawPosts(
  source: SocialMediaSourceDefinition,
  env: NodeJS.ProcessEnv,
  fetchJson: FetchJson,
): Promise<RawSocialMediaPost[]> {
  if (source.platform === "youtube") {
    const params = new URLSearchParams({
      part: "snippet",
      channelId: source.channelId!,
      type: "video",
      order: "date",
      maxResults: "25",
    });
    const payload = youtubeSchema.parse(
      await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`, {
        headers: { "x-goog-api-key": env.YOUTUBE_DATA_API_KEY! },
      }),
    );
    return payload.items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      text: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      sourceUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      imageUrl:
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.medium?.url ??
        null,
    }));
  }

  if (source.platform === "instagram") {
    const accountId = env[source.accountIdEnv!];
    const version = env.META_GRAPH_API_VERSION || "v25.0";
    const params = new URLSearchParams({
      fields: "id,caption,media_url,thumbnail_url,permalink,timestamp",
      limit: "25",
    });
    const payload = instagramSchema.parse(
      await fetchJson(`https://graph.facebook.com/${version}/${accountId}/media?${params}`, {
        headers: {
          authorization: `Bearer ${env.META_INSTAGRAM_ACCESS_TOKEN}`,
        },
      }),
    );
    return payload.data.map((item) => ({
      id: item.id,
      text: item.caption,
      publishedAt: item.timestamp,
      sourceUrl: item.permalink,
      imageUrl: item.thumbnail_url ?? item.media_url ?? null,
    }));
  }

  if (source.platform === "x") {
    const headers = { authorization: `Bearer ${env.X_BEARER_TOKEN}` };
    const user = xUserSchema.parse(
      await fetchJson(
        `https://api.x.com/2/users/by/username/${source.username}`,
        { headers },
      ),
    );
    const params = new URLSearchParams({
      max_results: "25",
      "tweet.fields": "created_at,note_tweet",
      exclude: "retweets,replies",
    });
    const payload = xPostsSchema.parse(
      await fetchJson(`https://api.x.com/2/users/${user.data.id}/tweets?${params}`, {
        headers,
      }),
    );
    return payload.data.map((item) => ({
      id: item.id,
      text: item.note_tweet?.text ?? item.text,
      publishedAt: item.created_at ?? null,
      sourceUrl: `https://x.com/${source.username}/status/${item.id}`,
    }));
  }

  const organizationUrn = env[source.organizationUrnEnv!];
  const params = new URLSearchParams({
    q: "author",
    author: organizationUrn!,
    count: "25",
    sortBy: "LAST_MODIFIED",
  });
  const payload = linkedInSchema.parse(
    await fetchJson(`https://api.linkedin.com/rest/posts?${params}`, {
      headers: {
        authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
        "Linkedin-Version": env.LINKEDIN_API_VERSION || "202606",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }),
  );
  return payload.elements.map((item) => ({
    id: item.id,
    text: item.commentary,
    publishedAt: item.publishedAt
      ? new Date(item.publishedAt).toISOString()
      : null,
    sourceUrl: `https://www.linkedin.com/feed/update/${item.id}`,
  }));
}

export async function collectSocialMediaSource(
  source: SocialMediaSourceDefinition,
  dependencies: SocialCollectorDependencies = {},
): Promise<OpportunityInput[]> {
  const env = dependencies.env ?? process.env;
  const fetchJson = dependencies.fetchJson ?? defaultFetchJson;
  const fetchedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const posts = await collectRawPosts(source, env, fetchJson);

  return posts
    .filter((post) =>
      matchesSocialMediaKeywords(
        `${post.title ?? ""} ${post.text}`,
        source.keywords,
      ),
    )
    .map((post) => mapSocialMediaPost(source, post, fetchedAt));
}

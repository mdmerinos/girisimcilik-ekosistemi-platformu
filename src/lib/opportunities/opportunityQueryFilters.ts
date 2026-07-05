import {
  INVESTMENT_CATEGORY,
  isStrictInvestmentOpportunity,
} from "@/lib/ingestion/investmentClassification";
import {
  type CountryGroup,
  matchesCountryGroup,
} from "@/lib/opportunities/countryGroup";
import { sanitizeNasaSbirOpportunityDates } from "@/lib/opportunities/nasaSbirDates";
import {
  type StatFilter,
  type TimeRange,
  type TodayFilter,
  matchesOpportunitySearch,
  matchesStatFilter,
  matchesTodayFilter,
  matchesTimeRange,
} from "@/lib/opportunities/opportunityFilters";
import {
  type OpportunitySource,
  matchesOpportunitySource,
} from "@/lib/opportunities/opportunitySource";
import {
  OPPORTUNITY_CATEGORIES,
  type Opportunity,
  type OpportunityCategory,
} from "@/types/opportunity";

export const TODAY_QUERY_FILTERS = [
  "all",
  "ingested",
  "published",
  "deadline",
  "todayIngested",
  "todayPublished",
  "deadlineToday",
] as const;
export type TodayQueryFilter = (typeof TODAY_QUERY_FILTERS)[number];

export const CATEGORY_FILTER_CODES = [
  "ULS-FON",
  "INT-FON",
  "YAT-AG",
  "ETK-PRG",
  "HBR-SOS",
] as const;
export type CategoryFilterCode = (typeof CATEGORY_FILTER_CODES)[number];
export const CATEGORY_QUERY_FILTERS = [
  ...OPPORTUNITY_CATEGORIES,
  ...CATEGORY_FILTER_CODES,
] as const;
export type CategoryQueryFilter = (typeof CATEGORY_QUERY_FILTERS)[number];
export const CONTENT_VIEWS = [
  "all",
  "funding",
  "news",
  "investments",
  "programs",
] as const;
export type ContentView = (typeof CONTENT_VIEWS)[number];

const CATEGORY_BY_CODE: Record<CategoryFilterCode, OpportunityCategory> = {
  "ULS-FON": "Ulusal Destek ve Fonlar",
  "INT-FON": "Uluslararası Fonlar",
  "YAT-AG": "Yatırım ve Sermaye Ağları",
  "ETK-PRG": "Etkinlik ve Programlar",
  "HBR-SOS": "Haber ve Sosyal Medya Akışı",
};

export function resolveTodayFilter(value: TodayQueryFilter): TodayFilter {
  if (value === "todayIngested") return "ingested";
  if (value === "todayPublished") return "published";
  if (value === "deadlineToday") return "deadline";
  return value;
}

export function resolveCategoryFilter(
  value?: CategoryQueryFilter,
): OpportunityCategory | undefined {
  if (!value) return undefined;
  return CATEGORY_BY_CODE[value as CategoryFilterCode] ?? value as OpportunityCategory;
}

export type OpportunityQueryFilterOptions = {
  category?: OpportunityCategory;
  contentView?: ContentView;
  countryGroup: CountryGroup;
  timeRange: TimeRange;
  today: TodayFilter;
  statFilter: StatFilter;
  source: OpportunitySource;
  query?: string;
};

export function matchesContentView(
  item: Pick<Opportunity, "category">,
  contentView: ContentView = "all",
): boolean {
  if (contentView === "all") return true;
  if (contentView === "funding") {
    return (
      item.category === "Ulusal Destek ve Fonlar" ||
      item.category === "Uluslararası Fonlar"
    );
  }
  if (contentView === "news") {
    return item.category === "Haber ve Sosyal Medya Akışı";
  }
  if (contentView === "investments") {
    return item.category === "Yatırım ve Sermaye Ağları";
  }
  return item.category === "Etkinlik ve Programlar";
}

function isAllowedOpportunity(item: Opportunity): boolean {
  if (item.category !== INVESTMENT_CATEGORY) return true;
  return isStrictInvestmentOpportunity({
    title: item.title,
    summary: item.summary,
    sourceName: item.source_name,
    category: item.category,
  });
}

export function filterOpportunityRows(
  rows: Opportunity[],
  options: OpportunityQueryFilterOptions,
  now = new Date(),
): Opportunity[] {
  return rows
    .map(sanitizeNasaSbirOpportunityDates)
    .filter(isAllowedOpportunity)
    .filter((item) => matchesContentView(item, options.contentView))
    .filter((item) => matchesCountryGroup(item.location, options.countryGroup))
    .filter(
      (item) =>
        options.today !== "all" ||
        matchesTimeRange(item, options.timeRange, now),
    )
    .filter((item) => matchesTodayFilter(item, options.today, now))
    .filter((item) => matchesStatFilter(item, options.statFilter, now))
    .filter((item) => matchesOpportunitySource(item, options.source))
    .filter((item) => matchesOpportunitySearch(item, options.query))
    .filter(
      (item) => !options.category || item.category === options.category,
    );
}

export function getCategoryCounts(
  rows: Opportunity[],
): Record<OpportunityCategory, number> {
  return Object.fromEntries(
    OPPORTUNITY_CATEGORIES.map((category) => [
      category,
      rows.filter((item) => item.category === category).length,
    ]),
  ) as Record<OpportunityCategory, number>;
}

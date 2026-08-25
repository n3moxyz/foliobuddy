// Deterministic headline materiality classification for the News feed.
//
// "high" means the title indicates a potentially thesis-changing event
// (earnings, regulation, M&A, security incident, …) — likely decision
// relevance, never verified truth. Clickbait/speculation patterns force
// "low" even when they name a material topic: a price-prediction piece
// about an SEC ruling is still speculation.

export type NewsImportance = 'high' | 'medium' | 'low';

export type NewsEventType =
  | 'earnings'
  | 'regulation'
  | 'mna'
  | 'financing'
  | 'contract'
  | 'security'
  | 'leadership'
  | 'tokenomics'
  | 'flows'
  | 'macro'
  | 'rating'
  | 'product'
  | 'partnership'
  | 'industry'
  | 'opinion'
  | 'general';

export interface MaterialityResult {
  importance: NewsImportance;
  eventType: NewsEventType;
}

const CLICKBAIT_PATTERN =
  /price prediction|price forecast|\bcould (soar|surge|rally|explode|hit|reach)\b|here'?s why|why .{0,40}\b(is|are)\b (up|down|falling|rising|soaring|sliding)|should you buy|is it too late|what to know|things to know|\btop \d+\b|\bbest \d+\b|\b\d+ reasons?\b|reasons? (to|why)|price analysis|technical analysis|how to (buy|invest)|beginner'?s guide|make you (rich|a millionaire)|millionaire|if you('?d| had) invested/i;

interface EventRule {
  eventType: NewsEventType;
  importance: NewsImportance;
  pattern: RegExp;
}

// First match wins, so more specific/severe event classes come first.
const EVENT_RULES: EventRule[] = [
  {
    eventType: 'security',
    importance: 'high',
    pattern:
      /\bhack(?:ed|ers?)?\b|exploit(?:ed)?\b|\bbreach\b|funds? (stolen|drained)|\bstolen\b|vulnerabilit|51% attack|rug pull|\boutage\b|goes? offline|phishing/i,
  },
  {
    eventType: 'regulation',
    importance: 'high',
    // "(?<!per )sec" keeps "4,000 transactions per sec" out of SEC news.
    pattern:
      /(?<!per )\bsec\b|\b(cftc|doj|ftc|fdic|occ|fca|esma|mas)\b|regulators?|antitrust|lawsuit|\bsues?\b|court (rules|ruling|order)|judge (rules|blocks|approves)|settlement|\bfined?\b|sanctions?|subpoena|enforcement|etf approval|approv(es|al).{0,30}\betf\b|\bbans?\b|\bbanned\b|legislation|bill (passes|signed)|executive order|tariffs?/i,
  },
  {
    eventType: 'earnings',
    importance: 'high',
    pattern:
      /\bearnings\b|quarterly (results|report)|q[1-4] (results|revenue|earnings)|full[- ]year (results|guidance)|\bguidance\b|profit warning|(beats?|miss(es)?|tops?) (estimates|expectations|forecasts)|revenue (jumps?|surges?|falls?|drops?|rose|fell)|posts? (record|a loss|profit)|net (income|loss)|outlook (raised|cut|lowered)/i,
  },
  {
    eventType: 'mna',
    importance: 'high',
    pattern:
      /\bacquir(?:es?|ing|ed)\b|acquisition|\bmergers?\b|takeover|buyout|agrees? to buy|to buy .{0,30}for \$|bankruptcy|chapter 11|restructuring|strategic review|spin[- ]?off|delist/i,
  },
  {
    eventType: 'financing',
    importance: 'high',
    pattern:
      /share (sale|offering)|secondary offering|dilution|buyback|share repurchase|convertible (notes?|bonds?)|raises? \$\d|funding round|series [a-e] round|capital raise|token sale|private placement|at[- ]the[- ]market offering|treasury (purchase|buys)/i,
  },
  {
    eventType: 'contract',
    importance: 'high',
    pattern:
      /wins? .{0,30}(contract|order|deal)|design win|firm order|order backlog|cancels? (order|contract)|supply (agreement|deal)|\$\d+\s?(billion|million|[bm]n?\b).{0,20}(deal|contract|order)/i,
  },
  {
    eventType: 'leadership',
    importance: 'high',
    pattern:
      /\b(ceo|cfo|coo|cto|chairman|founder)\b.{0,30}(steps down|resigns?|departs?|fired|ousted|exits|dies)|names? (new|interim) (ceo|cfo)|appoints? .{0,30}\b(ceo|cfo)\b/i,
  },
  {
    eventType: 'tokenomics',
    importance: 'high',
    pattern:
      /token unlock|unlock schedule|vesting|halving|emissions? (cut|schedule)|governance (vote|proposal)|hard fork|mainnet (launch|upgrade)|upgrade goes live|airdrop\b/i,
  },
  {
    eventType: 'flows',
    importance: 'high',
    pattern: /etf (inflows?|outflows?|flows)|fund flows|record (inflows?|outflows?)/i,
  },
  {
    eventType: 'macro',
    importance: 'high',
    // "fed(?!\s+(up|into|...))" keeps "investors fed up with…" out of Fed news.
    pattern:
      /\bfed\b(?!\s+(up|into|by|through|to)\b)|federal reserve|fomc|rate (cut|hike|decision)|interest rates?|\bcpi\b|inflation (data|report|cools|eases|accelerat)|jobs report|nonfarm payrolls|unemployment rate|\bgdp\b|recession|central bank|treasury yields?|\becb\b|bank of japan|\bboj\b|\bpboc\b|debt ceiling|government shutdown/i,
  },
  {
    // Analyst calls are high only when the headline evidences an actual
    // target/rating revision; bare commentary falls through to "rating" medium.
    eventType: 'rating',
    importance: 'high',
    pattern:
      /\b(upgrades?|downgrades?)\b.{0,50}(price target|to (buy|sell|hold|overweight|underweight|neutral))|(raises?|cuts?|lifts?|hikes?) (its )?price target/i,
  },
  {
    eventType: 'partnership',
    importance: 'medium',
    pattern:
      /partner(s|ships?)?\b|collaborat|teams? up|integrat(es?|ion)|pilot (program|project)|joins? forces|expands? (into|to)\b/i,
  },
  {
    eventType: 'product',
    importance: 'medium',
    pattern: /launch(es|ed)?\b|unveils?|\breleases?\b|debuts?|rolls? out|introduces?/i,
  },
  {
    eventType: 'industry',
    importance: 'medium',
    pattern:
      /shipments|market share|sales (rose|fell|grew|slid)|demand (for|rises|falls|surges)|production (cut|boost|ramp)|\bcapacity\b|prices? (of|for) (memory|chips|nand|dram)/i,
  },
  {
    eventType: 'rating',
    importance: 'medium',
    pattern: /analysts? (says?|sees?|expects?|warns?)|initiates? coverage|reiterates?/i,
  },
];

export function classifyMateriality(title: string): MaterialityResult {
  if (CLICKBAIT_PATTERN.test(title)) {
    return { importance: 'low', eventType: 'opinion' };
  }
  for (const rule of EVENT_RULES) {
    if (rule.pattern.test(title)) {
      return { importance: rule.importance, eventType: rule.eventType };
    }
  }
  return { importance: 'low', eventType: 'general' };
}

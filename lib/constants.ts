export const PASS_THRESHOLD = 0.75
export const LIBRARY_VERSION = '1.4.0'
export const WEEKS = 9
export const DAYS_PER_WEEK = 7
export const DAILY_CHALLENGE_QUESTION_COUNT = 4
/** Estimated minutes for the daily challenge quiz (4 questions × ~4 min each). */
export const QUIZ_ESTIMATED_MINUTES = 15
export const QUIZ_BANK_VERSION = '1.0.0'

// Dashboard day-cell badge score thresholds (calibrated against the new scoring system).
// With aTotal-denominator and x^1.5 quiz curve:
//   • ≥80  dark green  — strong student (all A pass + B + quiz 80%+)
//   • ≥65  light green — good student  (gate + quiz 75% + some B)
//   • ≥50  amber       — minimal pass  (gate met + quiz at 60%)
//   • <50  red         — needs attention
export const BADGE_DARK_GREEN  = 80
export const BADGE_LIGHT_GREEN = 65
// BADGE_AMBER lowered to 48 so that a student who passes the gate at exactly 75%
// (aScore = 30 + 25*0.75 = 48.75 → rounded 49) still sees amber, not red.
export const BADGE_AMBER       = 48

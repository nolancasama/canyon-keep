import { CONFIG } from '../../config.js';

// The visible treasury includes the client's remaining budget and the engineer's
// unspent bounties. Only the client's emergency allowance limits client spending.
export function initializeBattleEconomy(state) {
  state.emergency={constructionFunds:state.gold,clientEmergencySpent:0,
    bountyEarned:0,bountySpent:0,constructionSpending:0,repairSpending:0,
    spent:0,cap:CONFIG.frontier.emergencyCap,paidEnemyIds:[]};
  return state.emergency;
}

export function availableEmergencyGold(state) {
  const ledger=state.emergency;
  if(!ledger) return 0;
  const client=Math.max(0,Math.min(ledger.constructionFunds,ledger.cap-ledger.clientEmergencySpent));
  return client+Math.max(0,ledger.bountyEarned-ledger.bountySpent);
}

// Partial payments let repairs stop at exactly the amount of HP paid for.
export function spendEmergencyGold(state,amount,category='construction') {
  if(state.stageId!=='frontier'||state.phase!=='siege'||!Number.isFinite(amount)||amount<=0) return 0;
  const ledger=state.emergency;
  const paid=Math.min(amount,availableEmergencyGold(state));
  if(paid<=0) return 0;
  const client=Math.min(paid,Math.max(0,Math.min(ledger.constructionFunds,ledger.cap-ledger.clientEmergencySpent)));
  ledger.constructionFunds=Math.max(0,ledger.constructionFunds-client);
  ledger.clientEmergencySpent+=client;
  ledger.bountySpent+=paid-client;
  ledger[category==='repair'?'repairSpending':'constructionSpending']+=paid;
  ledger.spent+=paid;
  state.gold=Math.max(0,ledger.constructionFunds+ledger.bountyEarned-ledger.bountySpent);
  return paid;
}

export function awardFrontierBounty(state,enemy) {
  const ledger=state.emergency??initializeBattleEconomy(state);
  if(ledger.paidEnemyIds.includes(enemy.id)) return false;
  ledger.paidEnemyIds.push(enemy.id);
  const bounty=CONFIG.bounties[enemy.type];
  ledger.bountyEarned+=bounty;
  state.gold+=bounty;
  return true;
}

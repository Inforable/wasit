export const REQUEST_STATUS = {
  needs_clarification: 'Needs more detail', awaiting_customer: 'Offers ready to review', locked: 'Agreement selected',
  no_match: 'No matching offers', failed: 'Request stopped', submitted: 'In progress', formatting: 'Preparing your request',
  contacting: 'Contacting providers', negotiating: 'Negotiating', evaluating: 'Comparing offers',
};

export function historyDestination(request) {
  return request.deal_id ? '/deals/' + encodeURIComponent(request.deal_id) : '/requests/' + encodeURIComponent(request.id);
}

export function historyDate(timestamp) {
  return new Date(timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

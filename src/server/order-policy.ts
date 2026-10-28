const allowed:Record<string,string[]>={PLACED:['ACCEPTED','PREPARING','CANCELLED','REJECTED'],ACCEPTED:['PREPARING','CANCELLED'],PREPARING:['READY','CANCELLED'],READY:['SERVED','COLLECTED','DELIVERED'],SERVED:[],COLLECTED:[],DELIVERED:[],CANCELLED:[],REJECTED:[]};
export function canTransitionOrder(from:string,to:string){return allowed[from]?.includes(to)??false}
export function canCustomerCancelOrder(status:string){return status==='PLACED'||status==='ACCEPTED'}

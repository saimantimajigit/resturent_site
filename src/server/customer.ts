import 'server-only';
import {currentUser} from './session';
import {db} from './db';

export async function currentCustomer(){
 const user=await currentUser();
 if(!user)return null;
 const guest=await db.guestProfile.findUnique({where:{userId:user.id}});
 return guest?{user,guest}:null;
}

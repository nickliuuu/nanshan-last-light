import {env} from 'cloudflare:workers';
import {handleRooms} from '../../../server/rooms.mjs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleRooms(request,env.DB);}

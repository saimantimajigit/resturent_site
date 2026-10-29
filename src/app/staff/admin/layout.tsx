import {staffPageContext} from '@/server/staff-context';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){await staffPageContext(['MANAGER','OWNER']);return <>{children}</>}

import {AdminWorkspace} from '@/components/admin-workspace';
export default function AdminAudit(){return <main className="layout"><p className="eyebrow">Restaurant administration</p><h1>Audit history</h1><p className="muted">Review sensitive management changes by actor, target and time.</p><AdminWorkspace section="audit"/></main>}

import type {Metadata} from 'next';
import CustomerAuthForm from '@/components/customer-auth-form';
export const metadata:Metadata={title:'Sign in'};
export default function Login(){return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Your SAVORÉ table</p><h1>Welcome back.</h1><p>Sign in to keep your reservations and preferences close at hand.</p></div></section><main className="content-width"><div className="auth-card"><CustomerAuthForm mode="login"/><p className="auth-switch">New to SAVORÉ? <a href="/register">Create an account</a></p></div></main></>;}

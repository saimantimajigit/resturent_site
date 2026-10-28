import type {Metadata} from 'next';
import CustomerAuthForm from '@/components/customer-auth-form';
export const metadata:Metadata={title:'Create an account'};
export default function Register(){return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">A little more personal</p><h1>Make yourself<br/>at home.</h1><p>Create an account to keep your reservations and dining preferences together.</p></div></section><main className="content-width"><div className="auth-card"><CustomerAuthForm mode="register"/><p className="auth-switch">Already have an account? <a href="/login">Sign in</a></p></div></main></>;}

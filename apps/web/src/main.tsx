import React,{createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter,Link,NavLink,Navigate,Outlet,Route,Routes,useLocation,useNavigate } from 'react-router-dom';
import { FluentProvider,createLightTheme,Button,Avatar,type BrandVariants } from '@fluentui/react-components';
import { BookOpen,ChatCircle,ChartBar,Files,Megaphone,Question,SignOut,List,X,ArrowUpRight,GraduationCap,ShieldCheck } from '@phosphor-icons/react';
import type { SessionResult } from '@campus/contracts';
import '@fontsource-variable/geist';
import { api,setCsrf } from './api';
import { Loading,Notice } from './ui';
import { Login } from './pages/Login';
import { Dashboard,Settings } from './pages/Dashboard';
import { UnmatchedPage } from './pages/Knowledge';
import { FaqBank,KnowledgeHub } from './pages/KnowledgeCenter';
import { KnowledgeSkills } from './pages/KnowledgeSkills';
import { Notifications } from './pages/Notifications';
import { Materials } from './pages/Materials';
import { DeveloperAccounts } from './pages/DeveloperAccounts';
import { ServiceStatusProvider,SidebarSettings,useServiceStatus } from './service-status';
import './styles.css';
import './task-fixes.css';
import './ink-theme.css';
import './knowledge-center.css';
const brand:BrandVariants={10:'#080B0A',20:'#151C19',30:'#26332D',40:'#34473D',50:'#41574C',60:'#4D6558',70:'#5A7467',80:'#6B8476',90:'#7F988A',100:'#95AA9D',110:'#ADBEB2',120:'#C1CEC4',130:'#D4DED7',140:'#E3EAE5',150:'#F0F4F1',160:'#FAFCFA'};
const light=createLightTheme(brand);Object.assign(light,{colorBrandBackground:'#35463C',colorBrandBackgroundHover:'#26382D',colorBrandBackgroundPressed:'#1D2D24',colorBrandForeground1:'#35463C',colorBrandForeground2:'#35463C',colorBrandStroke1:'#657A6A',colorNeutralForeground1:'#252D29',colorNeutralForeground2:'#525B55',colorNeutralForeground3:'#626C65',fontFamilyBase:"'Microsoft YaHei','PingFang SC',sans-serif",borderRadiusMedium:'4px',borderRadiusLarge:'6px'});
const AuthContext=createContext<{session:SessionResult|null;loading:boolean;setSession:(value:SessionResult|null)=>void}>({session:null,loading:true,setSession:()=>{}});
export const useAuth=()=>useContext(AuthContext);
function AuthProvider({children}:{children:ReactNode}){const [session,change]=useState<SessionResult|null>(null),[loading,setLoading]=useState(true);const setSession=(value:SessionResult|null)=>{setCsrf(value?.csrfToken||'');change(value);};useEffect(()=>{api<SessionResult>('/auth/session').then(setSession).catch(()=>{}).finally(()=>setLoading(false));const expired=()=>setSession(null);window.addEventListener('session-expired',expired);return()=>window.removeEventListener('session-expired',expired);},[]);return <AuthContext.Provider value={{session,loading,setSession}}>{children}</AuthContext.Provider>;}
function RequireRole({role}:{role:'teacher'|'developer'}){const {session,loading}=useAuth();const location=useLocation();if(loading)return <Loading/>;if(!session)return <Navigate to="/login" state={{from:location.pathname}} replace/>;if(session.user.role!==role)return <Navigate to={session.user.role==='developer'?'/developer/accounts':'/admin'} replace/>;return <Outlet/>;}
function NavCount({value,label}:{value:number;label:string}){if(value<1)return null;return <span className="nav-count" aria-label={`${value}条${label}`}>{value>99?'99+':value}</span>;}
function TeacherNavigation(){const {admin}=useServiceStatus();return <><NavLink to="/admin" end><ChartBar size={20}/>工作概览</NavLink><NavLink to="/admin/knowledge"><BookOpen size={20}/>知识库</NavLink><NavLink to="/admin/unmatched"><Question size={20}/><span>待解答问题</span><NavCount value={admin?.pendingQuestions||0} label="待处理问题"/></NavLink><NavLink to="/admin/notifications"><Megaphone size={20}/>一键通知</NavLink><NavLink to="/admin/materials"><Files size={20}/><span>资料整理</span><NavCount value={admin?.pendingMaterials||0} label="待整理资料"/></NavLink></>;}
function Shell() {
  const {session,setSession}=useAuth(),location=useLocation(),navigate=useNavigate();const [menu,setMenu]=useState(false),[error,setError]=useState('');
  useEffect(()=>setMenu(false),[location.pathname]);
  useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  async function logout(){try{await api('/auth/logout',{method:'POST'});setSession(null);navigate('/login');}catch{setError('退出未完成，请检查网络后重试。');}}
  return <ServiceStatusProvider enabled={session?.user.role==='teacher'}><div className="app-shell"><a className="skip-link" href="#main">跳至主要内容</a>
    <aside className={`sidebar ${menu?'open':''}`} aria-label="主导航"><Button className="sidebar-close" appearance="subtle" aria-label="关闭侧栏" icon={<X/>} onClick={()=>setMenu(false)}/><Link to={session?.user.role==='developer'?'/developer/accounts':'/admin'} className="brand"><span className="brand-mark"><GraduationCap size={25} weight="bold"/></span><span className="brand-company"><strong>净千回源科技</strong><small>校园教务小助手</small></span></Link>
      <nav>{session?.user.role==='developer'?<NavLink to="/developer/accounts"><ShieldCheck size={20}/>账号管理</NavLink>:<TeacherNavigation/>}</nav>
      <div className="sidebar-bottom">{session?.user.role==='teacher'&&<SidebarSettings username={session.user.username}/>}</div>
    </aside>{menu&&<button className="nav-backdrop" aria-label="关闭导航" onClick={()=>setMenu(false)}/>}
    <div className="workspace"><div className="topbar"><div className="topbar-leading"><Button className="mobile-menu" appearance="subtle" aria-label={menu?'关闭导航':'打开导航'} icon={menu?<X/>:<List/>} onClick={()=>setMenu(!menu)}/><span>{session?.user.role==='developer'?'开发者':'校园教务'}<span className="crumb-divider">/</span>{session?.user.role==='developer'?'账号管理':'教师工作台'}</span></div><div className="topbar-actions">{session?<><span className="account-name"><Avatar size={28} name={session.user.username}/>{session.user.username}</span><Button appearance="subtle" icon={<SignOut size={18}/>} aria-label="退出登录" onClick={()=>void logout()}/></>:<Link to="/login" className="teacher-entry">老师入口 <ArrowUpRight size={15}/></Link>}</div></div>
      <main id="main" tabIndex={-1}>{error&&<Notice>{error}</Notice>}<Outlet/></main><footer className="workspace-footer"><span>校园教务小助手</span></footer>
    </div></div></ServiceStatusProvider>;
}
function Application(){return <FluentProvider theme={light} className="theme-root light ink-study"><BrowserRouter><AuthProvider><Routes><Route element={<Shell/>}><Route index element={<SessionHome/>}/><Route path="login" element={<Login/>}/><Route element={<RequireRole role="teacher"/>}><Route path="admin" element={<Dashboard/>}/><Route path="admin/questions" element={<Navigate to="/admin/knowledge/questions" replace/>}/><Route path="admin/knowledge" element={<KnowledgeHub/>}/><Route path="admin/knowledge/questions" element={<FaqBank libraryType="answer"/>}/><Route path="admin/knowledge/forbidden" element={<FaqBank libraryType="forbidden"/>}/><Route path="admin/knowledge/skills" element={<KnowledgeSkills/>}/><Route path="admin/unmatched" element={<UnmatchedPage/>}/><Route path="admin/notifications" element={<Notifications/>}/><Route path="admin/materials" element={<Materials/>}/><Route path="admin/settings" element={<Settings/>}/></Route><Route element={<RequireRole role="developer"/>}><Route path="developer/accounts" element={<DeveloperAccounts/>}/></Route><Route path="*" element={<div className="empty"><h1>这个页面暂不存在</h1><Link to="/">返回首页</Link></div>}/></Route></Routes></AuthProvider></BrowserRouter></FluentProvider>;}
function SessionHome(){const {session,loading}=useAuth();if(loading)return <Loading/>;return <Navigate to={!session?'/login':session.user.role==='developer'?'/developer/accounts':'/admin'} replace/>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Application/></React.StrictMode>);

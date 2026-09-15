import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Avatar,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  ProgressBar,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
} from "@fluentui/react-components";
import { GearSix, Lightning, LockKey, X } from "@phosphor-icons/react";
import type {
  AccountPlanStatus,
  AdminStatus,
  ModelsStatus,
  TextModelProvider,
} from "@campus/contracts";
import { api, messageOf } from "./api";
import { DeveloperManagement } from "./pages/Dashboard";

interface ServiceState {
  admin: AdminStatus | null;
  models: ModelsStatus | null;
  account: AccountPlanStatus | null;
  error: boolean;
}
const empty: ServiceState = {
  admin: null,
  models: null,
  account: null,
  error: false,
};
const Context = createContext<ServiceState & { refresh: () => Promise<void> }>({
  ...empty,
  refresh: async () => {},
});
export const useServiceStatus = () => useContext(Context);
export function ServiceStatusProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<ServiceState>(empty),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++sequence.current;
    try {
      const [admin, models, account] = await Promise.all([
        api<AdminStatus>("/admin/status", {
          signal: AbortSignal.timeout(5000),
        }),
        api<ModelsStatus>("/admin/models", {
          signal: AbortSignal.timeout(5000),
        }),
        api<AccountPlanStatus>("/admin/account", {
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (request === sequence.current)
        setState({ admin, models, account, error: false });
    } catch {
      if (request === sequence.current)
        setState((previous) => ({ ...previous, error: true }));
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      setState(empty);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    const update = () => void refresh();
    window.addEventListener("services-updated", update);
    window.addEventListener("focus", update);
    return () => {
      sequence.current++;
      clearInterval(timer);
      window.removeEventListener("services-updated", update);
      window.removeEventListener("focus", update);
    };
  }, [enabled, refresh]);
  return (
    <Context.Provider value={{ ...state, refresh }}>
      {children}
    </Context.Provider>
  );
}
function SidebarServices() {
  const { admin, error, refresh } = useServiceStatus(),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const actionLock = useRef(false);
  const rows = [
    {
      id: "qq",
      name: "QQ机器人",
      started: !!admin?.qqAnswerEnabled,
      configured: !!admin?.botCredentialsConfigured,
      connecting: !!admin?.botProcessRunning && admin.botState !== "connected",
    },
  ];
  async function toggle(id: string, started: boolean) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(id);
    setNotice("");
    try {
      await api(`/admin/bot/${started ? "stop" : "start"}`, { method: "POST", body: {} });
    } catch (e) {
      setNotice(messageOf(e));
    } finally {
      await refresh();
      actionLock.current = false;
      setBusy("");
    }
  }
  return (
    <section className="sidebar-services" aria-label="服务连接">
      <h3>服务开关</h3>
      {rows.map((row) => {
        const hint = !row.configured
          ? "请先在开发管理系统保存 AppID 和 AppSecret"
          : row.started
            ? "暂停回答，消息仍会接收并排队"
            : "恢复回答并逐条处理排队问题";
        return (
          <div className="sidebar-service" key={row.id}>
            <div className="sidebar-service-copy">
              <span>{row.name}</span>
            </div>
            {busy === row.id ? (
              <Spinner size="tiny" label={`${row.name}处理中`} />
            ) : (
              <Switch
                className="sidebar-service-switch"
                aria-label={`${row.name}开关`}
                title={hint}
                checked={row.started}
                disabled={
                  error ||
                  !admin ||
                  (!row.started && !row.configured)
                }
                onChange={() => void toggle(row.id, row.started)}
              />
            )}
          </div>
        );
      })}
      {notice && (
        <p className="sidebar-service-error" role="alert">
          {notice}
        </p>
      )}
    </section>
  );
}
function ModelPicker(){
  const {models,refresh}=useServiceStatus(),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const choices=(models?.providers||[]).filter(item=>item.provider==='deepseek'||item.provider==='zhipu'),selected=choices.find(item=>item.provider===models?.activeTextProvider),permissionNotice=models&&!selected?.connected?(notice||'该模型无权限'):'';
  async function choose(provider:TextModelProvider){setBusy(true);setNotice('');try{const result=await api<ModelsStatus>('/admin/models/select',{method:'POST',body:{provider}}),selected=result.providers.find(item=>item.provider===provider);if(!selected?.connected)setNotice('该模型无权限');await refresh();}catch(error){setNotice(messageOf(error));}finally{setBusy(false);}}
  return <section className="settings-model-picker" aria-label="回答模型选择"><h3>回答模型</h3>{models?<RadioGroup value={models.activeTextProvider} onChange={(_,data)=>void choose(data.value as TextModelProvider)} disabled={busy}>{choices.map(item=><Radio key={item.provider} value={item.provider} label={item.name}/>)}</RadioGroup>:<Spinner size="tiny" label="正在读取模型"/>}{permissionNotice&&<p className="sidebar-service-error" role="alert">{permissionNotice}</p>}</section>;
}
export function SidebarSettings({ username }: { username: string }) {
  const { account, refresh } = useServiceStatus(),
    [open, setOpen] = useState(false),
    [developerOpen,setDeveloperOpen]=useState(false),
    [upgrade, setUpgrade] = useState(false),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await api<AccountPlanStatus>("/admin/account/upgrade", {
        method: "POST",
        body: { key },
      });
      setKey("");
      setUpgrade(false);
      await refresh();
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  const usage = account?.usage.consumedPercent ?? 0,
    plan = account?.plan === "pro" ? "Pro" : "Plus";
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(_, data) => setOpen(data.open)}
        positioning={{ position: "above", align: "start" }}
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            className="sidebar-settings-trigger"
            appearance="subtle"
            icon={<GearSix size={20} />}
          >
            设置
          </Button>
        </PopoverTrigger>
        <PopoverSurface className="account-popover">
          <div className="account-popover-head">
            <Avatar size={36} name={username} />
            <span>
              <strong>{username}</strong>
              <small>{plan}</small>
            </span>
            <Button
              appearance="subtle"
              size="small"
              icon={<X />}
              aria-label="关闭设置"
              onClick={() => setOpen(false)}
            />
          </div>
          <div className="account-quota">
            <div>
              <span>本周额度消耗</span>
              <strong>{usage.toFixed(2)}%</strong>
            </div>
            <ProgressBar aria-label="本周额度消耗百分比" value={usage / 100} />
          </div>
          {account?.plan !== "pro" && (
            <Button
              appearance="primary"
              icon={<Lightning />}
              onClick={() => {
                setOpen(false);
                setUpgrade(true);
              }}
            >
              升级为 Pro
            </Button>
          )}
          <ModelPicker />
          <SidebarServices />
          <Button appearance="secondary" icon={<LockKey/>} onClick={()=>{setOpen(false);setDeveloperOpen(true);}}>开发管理系统</Button>
        </PopoverSurface>
      </Popover>
      <Dialog
        open={upgrade}
        onOpenChange={(_, data) => !data.open && !busy && setUpgrade(false)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>升级为 Pro</DialogTitle>
            <DialogContent>
              <form
                id="upgrade-plan-form"
                className="upgrade-plan-form"
                onSubmit={submit}
              >
                <Field label="升级密匙" required validationMessage={notice}>
                  <Input
                    type="password"
                    autoComplete="off"
                    value={key}
                    onChange={(_, data) => setKey(data.value)}
                    required
                  />
                </Field>
                <p>升级后，本周可用模型额度自动调整为 Plus 的 5 倍。</p>
              </form>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setUpgrade(false)}>
                取消
              </Button>
              <Button
                form="upgrade-plan-form"
                type="submit"
                appearance="primary"
                disabled={busy || !key}
              >
                {busy ? "正在验证" : "确认升级"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog open={developerOpen} onOpenChange={(_,data)=>setDeveloperOpen(data.open)}>
        <DialogSurface className="developer-management-dialog">
          <DialogBody>
            <DialogTitle>开发管理系统</DialogTitle>
            <DialogContent><DeveloperManagement embedded/></DialogContent>
            <DialogActions><Button onClick={()=>setDeveloperOpen(false)}>关闭</Button></DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

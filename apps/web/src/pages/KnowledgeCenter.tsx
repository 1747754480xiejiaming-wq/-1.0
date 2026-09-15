import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  ProgressBar,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "@fluentui/react-components";
import {
  Archive,
  ArrowClockwise,
  ArrowLeft,
  ArrowRight,
  Books,
  Brain,
  Check,
  DownloadSimple,
  File,
  FileArrowUp,
  Files,
  Folder,
  FolderOpen,
  Gear,
  HardDrives,
  ListMagnifyingGlass,
  MagicWand,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Prohibit,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import type {
  Faq,
  FaqAttachment,
  FaqInput,
  FaqLibraryType,
  KnowledgeCategory,
  PageResult,
  RagChunk,
  RagDocument,
  RagEvaluationResult,
  RagFolder,
  RagSearchHit,
  RagSettings,
} from "@campus/contracts";
import { api, apiDownload, apiUpload, ApiError, messageOf } from "../api";
import {
  dateTime,
  Empty,
  FaqState,
  Loading,
  Notice,
  PageTitle,
  Pagination,
  Retry,
  useData,
} from "../ui";
export function KnowledgeHub() {
  return (
    <div className="admin-page knowledge-hub">
      <PageTitle eyebrow="KNOWLEDGE CENTER" title="知识库" />
      <div className="knowledge-hub-layout">
        <Link
          className="knowledge-entry knowledge-entry-primary"
          to="/admin/knowledge/questions"
        >
          <div className="entry-icon">
            <Books size={28} />
          </div>
          <h2>答疑题库</h2>
          <div className="entry-action">
            进入答疑题库 <ArrowRight />
          </div>
        </Link>
        <div className="knowledge-entry-stack">
          <Link
            className="knowledge-entry knowledge-entry-warning"
            to="/admin/knowledge/forbidden"
          >
            <div className="entry-icon">
              <Prohibit size={24} />
            </div>
            <h2>敏感词库</h2>
            <ArrowRight className="entry-corner" />
          </Link>
          <Link
            className="knowledge-entry knowledge-entry-rag"
            to="/admin/knowledge/skills"
          >
            <div className="entry-icon">
              <Brain size={24} />
            </div>
            <h2>知识库技能</h2>
            <ArrowRight className="entry-corner" />
          </Link>
        </div>
      </div>
    </div>
  );
}
function BackToKnowledge() {
  return (
    <Link
      className="knowledge-back"
      to="/admin/knowledge"
      aria-label="返回知识库"
      title="返回知识库"
    >
      <ArrowLeft size={22} />
    </Link>
  );
}
function CategoryDialog({
  open,
  libraryType,
  onClose,
  onChanged,
}: {
  open: boolean;
  libraryType: FaqLibraryType;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [revision, setRevision] = useState(0),
    [name, setName] = useState(""),
    [edit, setEdit] = useState<KnowledgeCategory | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { data, loading } = useData<{
    items: KnowledgeCategory[];
  }>(`/knowledge/categories?libraryType=${libraryType}`, revision);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        edit ? `/knowledge/categories/${edit.id}` : "/knowledge/categories",
        {
          method: edit ? "PATCH" : "POST",
          body: edit ? { name } : { name, libraryType },
        },
      );
      setName("");
      setEdit(null);
      setRevision((x) => x + 1);
      onChanged();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: KnowledgeCategory) {
    setBusy(true);
    setError("");
    try {
      await api(`/knowledge/categories/${item.id}`, { method: "DELETE" });
      setRevision((x) => x + 1);
      onChanged();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && !busy && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                icon={<X />}
                aria-label="关闭"
                onClick={onClose}
              />
            }
          >
            管理题库分类
          </DialogTitle>
          <DialogContent>
            {error && <Notice>{error}</Notice>}
            <form className="category-form" onSubmit={save}>
              <Field label={edit ? "重命名分类" : "新增分类"}>
                <Input
                  value={name}
                  maxLength={40}
                  onChange={(_, d) => setName(d.value)}
                />
              </Field>
              <Button
                type="submit"
                appearance="primary"
                disabled={busy || !name.trim()}
              >
                {edit ? "保存名称" : "新增分类"}
              </Button>
              {edit && (
                <Button
                  onClick={() => {
                    setEdit(null);
                    setName("");
                  }}
                >
                  取消
                </Button>
              )}
            </form>
            {loading ? (
              <Loading />
            ) : (
              <div className="category-list">
                {data?.items.map((item) => (
                  <div key={item.id}>
                    <span>{item.name}</span>
                    <div>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<PencilSimple />}
                        aria-label={`重命名 ${item.name}`}
                        onClick={() => {
                          setEdit(item);
                          setName(item.name);
                        }}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<Trash />}
                        aria-label={`删除 ${item.name}`}
                        onClick={() => void remove(item)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
function AttachmentPicker({
  current,
  files,
  setFiles,
  folderFiles,
  setFolderFiles,
  onDelete,
}: {
  current: FaqAttachment[];
  files: File[];
  setFiles: (v: File[]) => void;
  folderFiles: File[];
  setFolderFiles: (v: File[]) => void;
  onDelete: (item: FaqAttachment) => void;
}) {
  const folderRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);
  return (
    <div className="attachment-editor">
      <div className="attachment-heading">
        <div>
          <strong>随答案发送的附件</strong>
          <span>
            原文件不解析，QQ
            命中答案后按顺序发送。支持文件夹、视频、图片、PDF、Word、Excel。
          </span>
        </div>
      </div>
      {current.length > 0 && (
        <div className="attachment-list">
          {current.map((item) => (
            <div key={item.id}>
              <File />
              <span>
                {item.name}
                <small>{(item.size / 1024 / 1024).toFixed(2)} MB</small>
              </span>
              <Button
                appearance="subtle"
                size="small"
                icon={<Trash />}
                aria-label={`删除 ${item.name}`}
                onClick={() => onDelete(item)}
              />
            </div>
          ))}
        </div>
      )}
      <div className="attachment-pickers">
        <label className="file-pick">
          <Files />
          <span>选择文件</span>
          <input
            type="file"
            multiple
            accept="video/*,image/*,.mp4,.mov,.avi,.mkv,.webm,.wmv,.m4v,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setFiles([...(e.target.files || [])])}
          />
        </label>
        <label className="file-pick">
          <FolderOpen />
          <span>选择文件夹</span>
          <input
            ref={folderRef}
            type="file"
            multiple
            onChange={(e) => setFolderFiles([...(e.target.files || [])])}
          />
        </label>
      </div>
      {(files.length > 0 || folderFiles.length > 0) && (
        <p className="selected-files">
          待上传：{files.map((x) => x.name).join("、")}
          {files.length > 0 && folderFiles.length > 0 ? "；" : ""}
          {folderFiles.length > 0
            ? `文件夹内 ${folderFiles.length} 个文件`
            : ""}
        </p>
      )}
    </div>
  );
}
function FaqEditor({
  initial,
  open,
  libraryType,
  categories,
  onClose,
  onSaved,
}: {
  initial: Partial<Faq> | null;
  open: boolean;
  libraryType: FaqLibraryType;
  categories: KnowledgeCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FaqInput>({
      question: "",
      answer: "",
      keywords: [],
      category: "",
      status: "disabled",
      confirmed: false,
      libraryType,
    }),
    [keywordText, setKeywordText] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [folderFiles, setFolderFiles] = useState<File[]>([]),
    [currentAttachments, setCurrentAttachments] = useState<FaqAttachment[]>([]),
    [busy, setBusy] = useState(false),
    [optimizing, setOptimizing] = useState(false),
    [optimized, setOptimized] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setForm({
      question: initial?.question || "",
      answer: initial?.answer || "",
      keywords: initial?.keywords || [],
      category: initial?.category || categories[0]?.name || "",
      status: initial?.status || "disabled",
      confirmed: false,
      libraryType,
    });
    setKeywordText((initial?.keywords || []).join("，"));
    setFiles([]);
    setFolderFiles([]);
    setCurrentAttachments(initial?.attachments || []);
    setOptimized(false);
    setError("");
  }, [open, initial?.id, initial?.version, categories.length, libraryType]);
  const change = <K extends keyof FaqInput>(key: K, value: FaqInput[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  async function remove(item: FaqAttachment) {
    if (!initial?.id) return;
    try {
      await api(`/faqs/${initial.id}/attachments/${item.id}`, {
        method: "DELETE",
      });
      setCurrentAttachments((old) => old.filter((x) => x.id !== item.id));
    } catch (e) {
      setError(messageOf(e));
    }
  }
  async function optimizeAnswer() {
    if (libraryType !== "answer" || !form.answer.trim()) return;
    setOptimizing(true);
    setOptimized(false);
    setError("");
    try {
      const result = await api<{ answer: string }>("/faqs/optimize-answer", {
        method: "POST",
        body: { question: form.question, answer: form.answer },
      });
      setForm((old) => ({ ...old, answer: result.answer, confirmed: false }));
      setOptimized(true);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setOptimizing(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form,
        keywords: keywordText
          .split(/[,，\n]/)
          .map((x) => x.trim())
          .filter(Boolean),
        libraryType,
      };
      const saved = await api<Faq>(
        initial?.id ? `/faqs/${initial.id}` : "/faqs",
        {
          method: initial?.id ? "PATCH" : "POST",
          body: initial?.id ? { ...body, version: initial.version } : body,
        },
      );
      if (files.length) {
        const data = new FormData();
        for (const file of files) data.append("file", file, file.name);
        await apiUpload(`/faqs/${saved.id}/attachments`, data);
      }
      if (folderFiles.length) {
        const data = new FormData();
        for (const file of folderFiles)
          data.append(
            "file",
            file,
            (
              file as File & {
                webkitRelativePath?: string;
              }
            ).webkitRelativePath || file.name,
          );
        const folder =
          (
            folderFiles[0] as File & {
              webkitRelativePath?: string;
            }
          ).webkitRelativePath?.split("/")[0] || "资料文件夹";
        await apiUpload(
          `/faqs/${saved.id}/attachments?kind=folder&folderName=${encodeURIComponent(folder)}`,
          data,
        );
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? `${e.message} 请刷新后重试。`
          : messageOf(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && !busy && !optimizing && onClose()}>
      <DialogSurface className="faq-dialog">
        <DialogBody>
          <DialogTitle
            action={
              <Button
                appearance="subtle"
                icon={<X />}
                aria-label="关闭"
                disabled={busy || optimizing}
                onClick={onClose}
              />
            }
          >
            {initial?.id ? "编辑" : "新增"}
            {libraryType === "answer" ? "答疑条目" : "敏感词"}
          </DialogTitle>
          <DialogContent>
            <form
              id="knowledge-entry-form"
              className="editor-form"
              onSubmit={submit}
            >
              {error && <Notice>{error}</Notice>}
              {optimized && <Notice intent="success">标准答案已优化，请核实内容后再保存。</Notice>}
              <Field label={libraryType === "answer" ? "标准问题" : "敏感词"} required>
                <Input
                  value={form.question}
                  maxLength={200}
                  onChange={(_, d) => change("question", d.value)}
                />
              </Field>
              <Field
                className={libraryType === "answer" ? "answer-field" : undefined}
                label={libraryType === "answer" ? <span className="answer-field-label"><span>标准答案</span><Button type="button" size="small" appearance="subtle" icon={optimizing ? <Spinner size="tiny" /> : <MagicWand />} disabled={busy || optimizing || !form.answer.trim()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void optimizeAnswer(); }}>{optimizing ? "优化中" : "智能优化"}</Button></span> : "拦截提示"}
                required
                hint={`${form.answer.length}/1500`}
              >
                <Textarea
                  value={form.answer}
                  rows={5}
                  maxLength={1500}
                  resize="vertical"
                  onChange={(_, d) => change("answer", d.value)}
                />
              </Field>
              <Field label={libraryType === "answer" ? "匹配关键词" : "同义词与关联词"} required hint="使用逗号分隔多个关键词">
                <Input
                  value={keywordText}
                  onChange={(_, d) => setKeywordText(d.value)}
                />
              </Field>
              <div className="form-pair">
                <Field label="分类">
                  <Select
                    value={form.category}
                    onChange={(_, d) => change("category", d.value)}
                  >
                    {categories.map((x) => (
                      <option key={x.id} value={x.name}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="公开状态">
                  <Select
                    value={form.status}
                    onChange={(_, d) =>
                      change("status", d.value as FaqInput["status"])
                    }
                  >
                    <option value="disabled">停用</option>
                    <option value="active">启用</option>
                  </Select>
                </Field>
              </div>
              {libraryType === "answer" && (
                <AttachmentPicker
                  current={currentAttachments}
                  files={files}
                  setFiles={setFiles}
                  folderFiles={folderFiles}
                  setFolderFiles={setFolderFiles}
                  onDelete={(item) => void remove(item)}
                />
              )}
              <Checkbox
                checked={form.confirmed}
                onChange={(_, d) => change("confirmed", d.checked === true)}
                label="我已核实内容准确，可以用于自动回复。"
              />
            </form>
          </DialogContent>
          <DialogActions>
            <Button disabled={busy || optimizing} onClick={onClose}>
              取消
            </Button>
            <Button
              form="knowledge-entry-form"
              type="submit"
              appearance="primary"
              icon={busy ? <Spinner size="tiny" /> : <Check />}
              disabled={
                busy || optimizing ||
                (form.status === "active" && !form.confirmed) ||
                !form.category
              }
            >
              {busy ? "正在保存" : "保存条目"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
export function FaqBank({ libraryType }: { libraryType: FaqLibraryType }) {
  const answer = libraryType === "answer",
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [categoriesRevision, setCategoriesRevision] = useState(0),
    [editor, setEditor] = useState<Partial<Faq> | null>(null),
    [deleting, setDeleting] = useState<Faq | null>(null),
    [deletingBusy, setDeletingBusy] = useState(false),
    [categoryOpen, setCategoryOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [actionError, setActionError] = useState(""),
    [transferring, setTransferring] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [batchCategory, setBatchCategory] = useState(""),
    [batchStatus, setBatchStatus] = useState(""),
    [batchBusy, setBatchBusy] = useState(false),
    [batchDeleting, setBatchDeleting] = useState(false),
    importRef = useRef<HTMLInputElement | null>(null);
  const { data, error, loading } = useData<PageResult<Faq>>(
      "/faqs?" +
        new URLSearchParams({
          q: search,
          status,
          category,
          libraryType,
          page: String(page),
          pageSize: "10",
        }),
      revision,
    ),
    categoryData = useData<{
      items: KnowledgeCategory[];
    }>(`/knowledge/categories?libraryType=${libraryType}`, categoriesRevision),
    categories = categoryData.data?.items || [],
    items=data?.items||[],
    allSelected=items.length>0&&items.every(item=>selected.includes(item.id));
  useEffect(()=>setSelected(current=>current.filter(id=>items.some(item=>item.id===id))),[data]);
  async function exportAll() {
    setTransferring(true);
    setActionError("");
    try {
      const blob = await apiDownload(
          `/faqs/export.xlsx?libraryType=${libraryType}`,
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${answer ? "答疑题库" : "敏感词库"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(answer?"已导出答疑题库 Excel，仅包含题目数据，不包含附件。":"已导出敏感词库 Excel。");
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setTransferring(false);
    }
  }
  async function exportPackage() {
    setTransferring(true);
    setActionError("");
    try {
      const blob = await apiDownload(
          `/faqs/export-package.zip?libraryType=${libraryType}`,
        ),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `${answer ? "答疑题库" : "敏感词库"}完整资料包-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("完整资料包已导出，解压后可从 Excel 清单打开真实附件目录中的文件。");
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setTransferring(false);
    }
  }
  async function importAll(files: File[]) {
    setTransferring(true);
    setActionError("");
    try {
      const body = new FormData();
      for(const file of files)body.append("file",file,file.name);
      const result = await apiUpload<{
        count: number;
      }>(`/faqs/import.xlsx?libraryType=${libraryType}`, body);
      setNotice(
        `已从固定 Excel 模板导入 ${result.count} 条内容。导入项统一停用，请核实后启用。`,
      );
      setRevision((x) => x + 1);
      setCategoriesRevision((x) => x + 1);
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setTransferring(false);
      if (importRef.current) importRef.current.value = "";
    }
  }
  async function importAbuseCandidates(){
    setTransferring(true);setActionError("");
    try{
      const result=await api<{imported:number;skipped:number}>('/faqs/abuse-lexicon/import',{method:'POST'});
      setNotice(`已导入 ${result.imported} 条辱骂词候选，跳过 ${result.skipped} 条重复项。候选默认停用，请审核后批量启用。`);setRevision(value=>value+1);setCategoriesRevision(value=>value+1);
    }catch(error){setActionError(messageOf(error));}finally{setTransferring(false);}
  }
  async function deleteEntry() {
    if(!deleting)return;
    setDeletingBusy(true);
    setActionError("");
    try {
      await api(`/faqs/${deleting.id}`,{method:"DELETE",body:{version:deleting.version}});
      setNotice(answer?"答疑题目及其附件已删除。":"敏感词条目已删除。");
      setDeleting(null);
      if(data?.items.length===1&&page>1)setPage(value=>value-1);else setRevision(value=>value+1);
    } catch (e) {
      setActionError(messageOf(e));
    } finally {
      setDeletingBusy(false);
    }
  }
  async function applyBatch(){
    if(!selected.length||(!batchCategory&&!batchStatus))return;
    setBatchBusy(true);setActionError("");
    try{
      await api('/faqs/batch',{method:'POST',body:{ids:selected,libraryType,action:'update',...(batchCategory?{category:batchCategory}:{}),...(batchStatus?{status:batchStatus}:{})}});
      setNotice(`已批量更新 ${selected.length} 条${answer?'答疑内容':'敏感词'}。`);setSelected([]);setBatchCategory("");setBatchStatus("");setRevision(value=>value+1);
    }catch(error){setActionError(messageOf(error));}finally{setBatchBusy(false);}
  }
  async function deleteBatch(){
    if(!selected.length)return;
    setBatchBusy(true);setActionError("");
    try{
      await api('/faqs/batch',{method:'POST',body:{ids:selected,libraryType,action:'delete'}});
      const count=selected.length;setSelected([]);setBatchDeleting(false);setNotice(`已删除 ${count} 条${answer?'答疑内容及其附件':'敏感词'}。`);
      if(items.length===count&&page>1)setPage(value=>value-1);else setRevision(value=>value+1);
    }catch(error){setActionError(messageOf(error));}finally{setBatchBusy(false);}
  }
  return (
    <div className="admin-page faq-bank-page">
      <BackToKnowledge />
      <PageTitle
        eyebrow={answer ? "ANSWER LIBRARY" : "RESTRICTED LIBRARY"}
        title={answer ? "答疑题库" : "敏感词库"}
        actions={
          <>
            <Button icon={<Gear />} onClick={() => setCategoryOpen(true)}>
              管理分类
            </Button>
          <Button
            icon={<UploadSimple />}
            disabled={transferring}
            onClick={() => importRef.current?.click()}
          >
            一键导入 Excel
          </Button>
          {!answer&&<Button icon={<ListMagnifyingGlass/>} disabled={transferring} onClick={()=>void importAbuseCandidates()}>导入辱骂词候选</Button>}
          <Button
            icon={<DownloadSimple />}
            disabled={transferring}
            onClick={() => void exportAll()}
          >
            {transferring ? "正在处理" : "一键导出 Excel"}
          </Button>
          {answer&&<Button
            icon={<Archive />}
            disabled={transferring}
            onClick={() => void exportPackage()}
          >
            {transferring ? "正在处理" : "导出完整资料包"}
          </Button>}
          <input
            ref={importRef}
            hidden
            type="file"
            multiple
            accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
            onChange={(e) =>
              e.target.files?.length && void importAll([...e.target.files])
            }
          />
            <Button
              appearance="primary"
              icon={<Plus />}
              onClick={() => setEditor({})}
            >
              {answer?"新增条目":"新增敏感词"}
            </Button>
          </>
        }
      />
      {notice && <Notice intent="success">{notice}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}
      <section className="panel table-panel">
        <form
          className="table-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
            setPage(1);
          }}
        >
          <Field label="搜索题库">
            <Input
              contentBefore={<MagnifyingGlass />}
              value={q}
              placeholder="搜索问题或答案"
              onChange={(_, d) => setQ(d.value)}
            />
          </Field>
          <Field label="分类">
            <Select
              value={category}
              onChange={(_, d) => {
                setCategory(d.value);
                setPage(1);
              }}
            >
              <option value="">全部分类</option>
              {categories.map((x) => (
                <option key={x.id}>{x.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="状态">
            <Select value={status} onChange={(_, d) => setStatus(d.value)}>
              <option value="">全部状态</option>
              <option value="active">已启用</option>
              <option value="disabled">已停用</option>
            </Select>
          </Field>
          <Button type="submit">查询</Button>
          <Button
            icon={<ArrowClockwise />}
            aria-label="刷新"
            onClick={() => setRevision((x) => x + 1)}
          />
        </form>
        <div className="faq-batch-bar">
          <Checkbox checked={allSelected} aria-label="选择本页全部条目" onChange={()=>setSelected(allSelected?[]:items.map(item=>item.id))}/>
          <span>已选择 {selected.length} 条</span>
          <Select aria-label="批量修改分类" value={batchCategory} onChange={(_,d)=>setBatchCategory(d.value)}>
            <option value="">分类不变</option>
            {categories.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}
          </Select>
          <Select aria-label="批量修改状态" value={batchStatus} onChange={(_,d)=>setBatchStatus(d.value)}>
            <option value="">状态不变</option><option value="active">启用</option><option value="disabled">停用</option>
          </Select>
          <Button icon={batchBusy?<Spinner size="tiny"/>:<Check/>} disabled={!selected.length||(!batchCategory&&!batchStatus)||batchBusy} onClick={()=>void applyBatch()}>应用修改</Button>
          <Button className="faq-batch-delete" icon={<Trash/>} disabled={!selected.length||batchBusy} onClick={()=>setBatchDeleting(true)}>批量删除</Button>
        </div>
        {error ? (
          <Retry error={error} onRetry={() => setRevision((x) => x + 1)} />
        ) : loading ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="faq-select-column"><Checkbox checked={allSelected} aria-label="选择本页全部条目" onChange={()=>setSelected(allSelected?[]:items.map(item=>item.id))}/></th>
                    <th>{answer?"标准问题 / 关键词":"敏感词 / 同义词"}</th>
                    <th>分类</th>
                    {answer && <th>附件</th>}
                    <th>状态</th>
                    <th>最近更新</th>
                    <th className="faq-actions-column">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="faq-select-column"><Checkbox checked={selected.includes(item.id)} aria-label={`选择 ${item.question}`} onChange={(_,d)=>setSelected(current=>d.checked===true?[...new Set([...current,item.id])]:current.filter(id=>id!==item.id))}/></td>
                      <td>
                        <strong>{item.question}</strong>
                        <div className="keyword-list">
                          {item.keywords.slice(0, 3).map((k) => (
                            <span key={k}>{k}</span>
                          ))}
                        </div>
                      </td>
                      <td>{item.category}</td>
                      {answer && (
                        <td>
                          <Badge appearance="tint" icon={<Files />}>
                            {item.attachments?.length || 0}
                          </Badge>
                        </td>
                      )}
                      <td>
                        <FaqState status={item.status} isDemo={item.isDemo} />
                      </td>
                      <td className="date-cell">
                        {dateTime(item.updatedAt)}
                        <small>版本 {item.version}</small>
                      </td>
                      <td className="faq-actions-column">
                        <div className="faq-row-actions">
                        <Button
                          appearance="subtle"
                          icon={<PencilSimple />}
                          aria-label={`编辑 ${item.question}`}
                          onClick={() => setEditor(item)}
                        >
                          编辑
                        </Button>
                        <Button appearance="subtle" className="faq-delete-action" icon={<Trash />} aria-label={`删除 ${item.question}`} onClick={() => setDeleting(item)}>删除</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={10}
              total={data.total}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty
            title="题库中还没有内容"
            description="创建第一条经过核实的知识条目。"
            action={
              <Button icon={<Plus />} onClick={() => setEditor({})}>
                {answer?"新增条目":"新增敏感词"}
              </Button>
            }
          />
        )}
      </section>
      <FaqEditor
        initial={editor}
        open={editor !== null}
        libraryType={libraryType}
        categories={categories}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setNotice("条目与附件已保存，QQ 机器人将使用最新内容。");
          setRevision((x) => x + 1);
        }}
      />
      <CategoryDialog
        open={categoryOpen}
        libraryType={libraryType}
        onClose={() => setCategoryOpen(false)}
        onChanged={() => setCategoriesRevision((x) => x + 1)}
      />
      <Dialog open={deleting!==null} onOpenChange={(_,d)=>!d.open&&!deletingBusy&&setDeleting(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{answer?"删除答疑题目":"删除敏感词"}</DialogTitle>
            <DialogContent><p>确定删除“{deleting?.question}”吗？{answer&&"该题目的所有附件也会一并删除，此操作无法撤销。"}</p></DialogContent>
            <DialogActions>
              <Button disabled={deletingBusy} onClick={()=>setDeleting(null)}>取消</Button>
              <Button appearance="primary" disabled={deletingBusy} onClick={()=>void deleteEntry()}>{deletingBusy?"正在删除":"确认删除"}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog open={batchDeleting} onOpenChange={(_,d)=>!d.open&&!batchBusy&&setBatchDeleting(false)}>
        <DialogSurface><DialogBody><DialogTitle>批量删除</DialogTitle><DialogContent><p>确定删除选中的 {selected.length} 条{answer?'答疑内容':'敏感词'}吗？{answer&&'所有对应附件也会一并删除。'}此操作无法撤销。</p></DialogContent><DialogActions><Button disabled={batchBusy} onClick={()=>setBatchDeleting(false)}>取消</Button><Button appearance="primary" className="destructive-action" icon={batchBusy?<Spinner size="tiny"/>:<Trash/>} disabled={batchBusy} onClick={()=>void deleteBatch()}>{batchBusy?'正在删除':'确认删除'}</Button></DialogActions></DialogBody></DialogSurface>
      </Dialog>
    </div>
  );
}
type RagTree = {
  folders: RagFolder[];
  documents: RagDocument[];
};
type ModelGroup = {
  provider: string;
  items: {
    id: string;
    name: string;
  }[];
};
function ModelSelect({
  type,
  value,
  onChange,
}: {
  type: "embedding" | "rerank";
  value: string;
  onChange: (v: string) => void;
}) {
  const [groups, setGroups] = useState<ModelGroup[] | null>(null),
    [error, setError] = useState("");
  async function load() {
    if (groups) return;
    try {
      setGroups(
        (
          await api<{
            groups: ModelGroup[];
          }>(`/rag/models?type=${type}`)
        ).groups,
      );
    } catch (e) {
      setError(messageOf(e));
    }
  }
  return (
    <Field
      label={type === "embedding" ? "向量算法" : "混合检索"}
      validationMessage={error}
    >
      <Select
        value={value}
        onFocus={() => void load()}
        onChange={(_, d) => onChange(d.value)}
      >
        {!groups && <option value={value}>{value || "展开加载算法"}</option>}
        {groups?.map((group) => (
          <optgroup key={group.provider} label={group.provider}>
            {group.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </Field>
  );
}
export function KnowledgeSkills() {
  const [revision, setRevision] = useState(0),
    [folderId, setFolderId] = useState(""),
    [newFolder, setNewFolder] = useState(""),
    [notice, setNotice] = useState(""),
    [errorAction, setErrorAction] = useState(""),
    [settings, setSettings] = useState<RagSettings | null>(null),
    [modelsOpen, setModelsOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [hits, setHits] = useState<RagSearchHit[] | null>(null),
    [searching, setSearching] = useState(false),
    [chunks, setChunks] = useState<{
      document: RagDocument;
      items: RagChunk[];
    } | null>(null),
    [evalText, setEvalText] = useState(
      "如何办理缓考？ | 缓考申请\n成绩复核在哪里办理？ | 成绩复核",
    ),
    [evaluation, setEvaluation] = useState<RagEvaluationResult | null>(null),
    fileRef = useRef<HTMLInputElement | null>(null);
  const { data, error, loading } = useData<RagTree>("/rag/tree", revision),
    settingsData = useData<RagSettings>("/rag/settings", revision);
  useEffect(() => {
    if (settingsData.data && !settings) setSettings(settingsData.data);
  }, [settingsData.data]);
  useEffect(() => {
    if (
      !data?.documents.some(
        (x) => x.status === "pending" || x.status === "parsing",
      )
    )
      return;
    const id = window.setInterval(() => setRevision((x) => x + 1), 1800);
    return () => window.clearInterval(id);
  }, [data?.documents]);
  const folderDocs = useMemo(
    () => data?.documents.filter((x) => (x.folderId || "") === folderId) || [],
    [data, folderId],
  );
  async function upload(files: FileList) {
    setErrorAction("");
    try {
      for (const file of [...files]) {
        const body = new FormData();
        body.append("file", file);
        await apiUpload(
          `/rag/documents${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ""}`,
          body,
        );
      }
      setNotice("资料已上传，后台正在解析。");
      setRevision((x) => x + 1);
    } catch (e) {
      setErrorAction(messageOf(e));
    }
  }
  async function addFolder(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/rag/folders", { method: "POST", body: { name: newFolder } });
      setNewFolder("");
      setRevision((x) => x + 1);
    } catch (e) {
      setErrorAction(messageOf(e));
    }
  }
  async function showChunks(document: RagDocument) {
    try {
      const result = await api<{
        items: RagChunk[];
      }>(`/rag/documents/${document.id}/chunks`);
      setChunks({ document, items: result.items });
    } catch (e) {
      setErrorAction(messageOf(e));
    }
  }
  async function saveSettings() {
    if (!settings) return;
    try {
      setSettings(
        await api<RagSettings>("/rag/settings", {
          method: "PATCH",
          body: {
            embeddingModel: settings.embeddingModel,
            rerankModel: settings.rerankModel,
            parserMode: settings.parserMode,
            chunkSize: settings.chunkSize,
            chunkOverlap: settings.chunkOverlap,
            topK: settings.topK,
          },
        }),
      );
      setModelsOpen(false);
      setNotice("召回配置已保存，新解析与检索将使用这组参数。");
    } catch (e) {
      setErrorAction(messageOf(e));
    }
  }
  async function testSearch() {
    setSearching(true);
    setErrorAction("");
    try {
      setHits(
        (
          await api<{
            items: RagSearchHit[];
          }>("/rag/search", {
            method: "POST",
            body: { question, topK: settings?.topK || 5 },
          })
        ).items,
      );
    } catch (e) {
      setErrorAction(messageOf(e));
    } finally {
      setSearching(false);
    }
  }
  async function evaluate() {
    const cases = evalText
      .split("\n")
      .map((line) => line.split("|").map((x) => x.trim()))
      .filter((x) => x.length >= 2 && x[0] && x[1])
      .map(([question, expectedAnswer]) => ({ question, expectedAnswer }));
    try {
      setEvaluation(
        await api<RagEvaluationResult>("/rag/evaluate", {
          method: "POST",
          body: { cases },
        }),
      );
    } catch (e) {
      setErrorAction(messageOf(e));
    }
  }
  return (
    <div className="admin-page rag-page">
      <PageTitle
        eyebrow="RAG KNOWLEDGE SKILL"
        title="知识库技能"
        actions={
          <>
            <Button icon={<Gear />} onClick={() => setModelsOpen(true)}>
              检索配置
            </Button>
            <Button
              appearance="primary"
              icon={<FileArrowUp />}
              onClick={() => fileRef.current?.click()}
            >
              上传资料
            </Button>
            <input
              ref={fileRef}
              hidden
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls"
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </>
        }
      />
      {notice && <Notice intent="success">{notice}</Notice>}
      {errorAction && <Notice>{errorAction}</Notice>}
      {error ? (
        <Retry error={error} onRetry={() => setRevision((x) => x + 1)} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="rag-workspace">
          <aside className="panel rag-folders">
            <div className="panel-title">
              <div>
                <h2>资料目录</h2>
                <p>{data?.folders.length || 0} 个目录</p>
              </div>
              <Folder size={20} />
            </div>
            <button
              className={!folderId ? "selected" : ""}
              onClick={() => setFolderId("")}
            >
              <HardDrives />
              全部资料 <span>{data?.documents.length || 0}</span>
            </button>
            {data?.folders.map((folder) => (
              <button
                className={folderId === folder.id ? "selected" : ""}
                key={folder.id}
                onClick={() => setFolderId(folder.id)}
              >
                <Folder /> {folder.name}
                <span>
                  {
                    data.documents.filter((x) => x.folderId === folder.id)
                      .length
                  }
                </span>
              </button>
            ))}
            <form onSubmit={addFolder} className="new-folder">
              <Input
                size="small"
                value={newFolder}
                placeholder="新目录名称"
                onChange={(_, d) => setNewFolder(d.value)}
              />
              <Button
                size="small"
                type="submit"
                icon={<Plus />}
                disabled={!newFolder.trim()}
                aria-label="新增目录"
              />
            </form>
          </aside>
          <section className="panel rag-documents">
            <div className="panel-title">
              <div>
                <h2>
                  {folderId
                    ? data?.folders.find((x) => x.id === folderId)?.name
                    : "全部资料"}
                </h2>
                <p>解析进度、Chunk 与 Token 统计实时更新</p>
              </div>
              <Button
                size="small"
                icon={<ArrowClockwise />}
                onClick={() => setRevision((x) => x + 1)}
              >
                刷新
              </Button>
            </div>
            {folderDocs.length ? (
              <div className="document-list">
                {folderDocs.map((document) => (
                  <article key={document.id}>
                    <div className="document-icon">
                      <File />
                    </div>
                    <div className="document-main">
                      <div>
                        <strong>{document.name}</strong>
                        <Badge
                          appearance="tint"
                          color={
                            document.status === "ready"
                              ? "success"
                              : document.status === "failed"
                                ? "danger"
                                : "informative"
                          }
                        >
                          {document.status === "ready"
                            ? "已就绪"
                            : document.status === "failed"
                              ? "失败"
                              : document.status === "parsing"
                                ? "解析中"
                                : "等待中"}
                        </Badge>
                      </div>
                      <ProgressBar
                        thickness="medium"
                        value={document.progress / 100}
                      />
                      <small>
                        {(document.size / 1024 / 1024).toFixed(2)} MB ·{" "}
                        {document.chunkCount} Chunks ·{" "}
                        {document.tokenCount.toLocaleString()} Tokens
                      </small>
                      {document.error && (
                        <span className="inline-error">{document.error}</span>
                      )}
                    </div>
                    <div className="document-actions">
                      <Button
                        appearance="subtle"
                        icon={<ListMagnifyingGlass />}
                        disabled={!document.chunkCount}
                        onClick={() => void showChunks(document)}
                      >
                        切片
                      </Button>
                      <Button
                        appearance="subtle"
                        icon={<ArrowClockwise />}
                        onClick={async () => {
                          await api(`/rag/documents/${document.id}/reparse`, {
                            method: "POST",
                          });
                          setRevision((x) => x + 1);
                        }}
                      >
                        重解析
                      </Button>
                      <Button
                        appearance="subtle"
                        icon={<Trash />}
                        aria-label={`删除 ${document.name}`}
                        onClick={async () => {
                          await api(`/rag/documents/${document.id}`, {
                            method: "DELETE",
                          });
                          setRevision((x) => x + 1);
                        }}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="这个目录还没有资料"
                description="上传 PDF、Word 或 Excel 后，系统会自动提取文字并生成切片。"
                action={
                  <Button
                    icon={<FileArrowUp />}
                    onClick={() => fileRef.current?.click()}
                  >
                    上传资料
                  </Button>
                }
              />
            )}
          </section>
        </div>
      )}
      <div className="rag-testing">
        <section className="panel recall-panel">
          <div className="panel-title">
            <div>
              <h2>多路召回测试</h2>
              <p>同时观察关键词、向量和融合排序分数</p>
            </div>
            <MagnifyingGlass />
          </div>
          <div className="test-composer">
            <Input
              value={question}
              placeholder="输入一条真实学生问题"
              onChange={(_, d) => setQuestion(d.value)}
            />
            <Button
              appearance="primary"
              disabled={!question.trim() || searching}
              onClick={() => void testSearch()}
            >
              {searching ? "检索中" : "开始召回"}
            </Button>
          </div>
          {hits && (
            <div className="hit-list">
              {hits.length ? (
                hits.map((hit, index) => (
                  <article key={hit.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>
                        {hit.documentName} · Chunk {hit.position + 1}
                      </strong>
                      <p>{hit.content}</p>
                      <small>
                        关键词 {hit.keywordScore.toFixed(3)} · 向量{" "}
                        {hit.vectorScore.toFixed(3)} · Rerank{" "}
                        {hit.rerankScore.toFixed(3)}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="没有命中切片"
                  description="可补充资料、调整关键词或修改切片参数。"
                />
              )}
            </div>
          )}
        </section>
        <section className="panel eval-panel">
          <div className="panel-title">
            <div>
              <h2>RAG 效果评估</h2>
              <p>每行填写“问题 | 预期答案关键词”</p>
            </div>
            <Archive />
          </div>
          <Textarea
            rows={5}
            resize="vertical"
            value={evalText}
            onChange={(_, d) => setEvalText(d.value)}
          />
          <Button onClick={() => void evaluate()}>运行评测</Button>
          {evaluation && (
            <div className="eval-metrics">
              <div>
                <span>检索命中率</span>
                <strong>
                  {Math.round(evaluation.retrievalHitRate * 100)}%
                </strong>
              </div>
              <div>
                <span>答案关键词率</span>
                <strong>
                  {Math.round(evaluation.answerKeywordRate * 100)}%
                </strong>
              </div>
              <div>
                <span>平均延迟</span>
                <strong>{Math.round(evaluation.averageLatencyMs)} ms</strong>
              </div>
            </div>
          )}
        </section>
      </div>
      <Dialog
        open={modelsOpen}
        onOpenChange={(_, d) => !d.open && setModelsOpen(false)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>检索与解析配置</DialogTitle>
            <DialogContent>
              {settings && (
                <div className="editor-form">
                  <ModelSelect
                    type="embedding"
                    value={settings.embeddingModel}
                    onChange={(value) =>
                      setSettings({ ...settings, embeddingModel: value })
                    }
                  />
                  <ModelSelect
                    type="rerank"
                    value={settings.rerankModel}
                    onChange={(value) =>
                      setSettings({ ...settings, rerankModel: value })
                    }
                  />
                  <Field label="切片大小（字符）">
                    <Input
                      type="number"
                      value={String(settings.chunkSize)}
                      onChange={(_, d) =>
                        setSettings({ ...settings, chunkSize: Number(d.value) })
                      }
                    />
                  </Field>
                  <Field label="切片重叠（字符）">
                    <Input
                      type="number"
                      value={String(settings.chunkOverlap)}
                      onChange={(_, d) =>
                        setSettings({
                          ...settings,
                          chunkOverlap: Number(d.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Top K">
                    <Input
                      type="number"
                      value={String(settings.topK)}
                      onChange={(_, d) =>
                        setSettings({ ...settings, topK: Number(d.value) })
                      }
                    />
                  </Field>
                  <Switch
                    checked={settings.parserMode === "model"}
                    onChange={(_, d) =>
                      setSettings({
                        ...settings,
                        parserMode: d.checked ? "model" : "local",
                      })
                    }
                    label="使用已连接模型的 Token 生成资料摘要与关键词"
                  />
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setModelsOpen(false)}>取消</Button>
              <Button appearance="primary" onClick={() => void saveSettings()}>
                保存配置
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Dialog
        open={!!chunks}
        onOpenChange={(_, d) => !d.open && setChunks(null)}
      >
        <DialogSurface className="chunk-dialog">
          <DialogBody>
            <DialogTitle>{chunks?.document.name} · Chunk 切片</DialogTitle>
            <DialogContent>
              <div className="chunk-list">
                {chunks?.items.map((item) => (
                  <article key={item.id}>
                    <span>
                      Chunk {item.position + 1} · {item.tokenCount} Tokens
                    </span>
                    <p>{item.content}</p>
                  </article>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setChunks(null)}>关闭</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

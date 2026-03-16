import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'zh';

export const translations = {
  en: {
    nav_projects: 'Projects',
    nav_employees: 'AI Employees',
    nav_settings: 'Settings',
    
    settings_title: 'Global Settings',
    settings_appearance: 'Appearance',
    settings_appearance_desc: 'Choose your preferred application theme.',
    settings_theme_mode: 'Theme Mode',
    settings_toggle: 'Toggle to',
    settings_lang: 'Language',
    settings_lang_desc: 'Select application UI language.',
    
    projects_title: 'My Projects',
    projects_new: 'New Project',
    projects_name: 'Project Name',
    projects_desc: 'Description',
    projects_manager: 'AI Project Manager (Optional)',
    projects_create: 'Create Project',
    projects_cancel: 'Cancel',
    projects_delete: 'Delete',
    projects_open: 'Open Workspace',
    projects_stage: 'Stage:',
    
    emp_title: 'AI Employees',
    emp_add: 'Add Employee',
    emp_name: 'Name',
    emp_role: 'Role',
    emp_provider: 'API Provider',
    emp_model: 'Model (e.g. gpt-4o)',
    emp_skill: 'Skill file',
    emp_prompt: 'System Prompt',
    emp_save: 'Save Employee',
    
    ws_pm: 'Project Manager',
    ws_stage_research: 'Research',
    ws_stage_design: 'Design',
    ws_stage_planning: 'Planning',
    ws_stage_exec: 'Execution',
    ws_stage_maint: 'Maintenance',
    ws_btn_design: 'Start Design',
    ws_btn_plan: 'Generate Tasks',
    ws_btn_finish: 'Finish Project',
    ws_btn_maint: 'New Features',
    ws_chat_ph: 'Describe your workflow... (Shift+Enter for newline)',
    ws_chat_send: 'Send',
    ws_task_view: 'Task View',
    ws_graph: 'Graph',
    ws_kanban: 'Kanban',
    ws_add_task: 'Add Task',
    ws_start_proj: 'Start Project',
    ws_pause_proj: 'Pause Project',
    
    mod_desc: 'Description / Constraints',
    mod_deps: 'Parent Dependencies',
    mod_assign: 'Assignment Configuration',
    mod_human: 'Human',
    mod_predef: 'Predefined AI',
    mod_custom: 'Custom AI',
    mod_assets: 'Local Assets & Context',
    mod_add_path: 'Add Path',
    mod_deliv: 'Final Deliverables',
    mod_run_ai: 'Run AI Task',
    mod_save: 'Save Task',
    mod_delete: 'Delete',
    
    pm_role_research: 'Research phase pm role...',
    pm_role_design: 'Design phase pm role...',
    pm_role_planning: 'Planning phase pm role...',
    pm_role_execution: 'Execution phase pm role...',
    pm_role_maintenance: 'Maintenance phase pm role...',
    pm_trigger_design: '[System] Start Design',
    pm_trigger_planning: '[System] Generate Tasks',
    pm_trigger_maintenance: '[System] Confirm Complete',
    pm_task_generation_success: '✅ Successfully generated tasks',
    pm_task_generation_failed_confirm_retry: 'Task generation failed, retry?',
    pm_task_generation_retry_prompt: '[System Error] Invalid format, please generate tasks again.',
    new_task_title: 'New Task',
    stage_research: 'Research',
    stage_design: 'Design',
    stage_planning: 'Planning',
    stage_execution: 'Execution',
    stage_maintenance: 'Maintenance',
    project_manager: 'Project Manager',
    btn_start_design: 'Start Design',
    btn_generate_tasks: 'Generate Tasks',
    btn_generating_tasks: 'Generating Tasks...',
    btn_confirm_complete: 'Confirm Complete',
    btn_generate_new_tasks: 'Generate New Tasks',
    you: 'You',
    ai_thinking: 'Thinking...',
    ws_running_placeholder: 'Project is running...',

    task_title_ph: 'Task Title (e.g. Generate Thumbnail)',
    task_desc: 'Description / Constraints',
    task_desc_ph: 'What exactly needs to be done in this step?',
    task_parent_deps: 'Parent Dependencies',
    task_no_deps: 'No other tasks available.',
    task_assignment: 'Assignment Configuration',
    task_assign_human: 'Human',
    task_assign_predefined: 'Predefined AI',
    task_assign_custom: 'Custom AI',
    task_select_ai: '-- Select AI Employee --',
    task_custom_sandbox: 'Custom Sandbox',
    task_api_url_ph: 'API URL (e.g. OpenAI/ComfyUI)',
    task_api_key_ph: 'API Key',
    task_model_ph: 'Model',
    task_prompt_ph: 'Specific Prompt Instructions...',
    task_assets_title: 'Local Assets & Context',
    task_add_path: 'Add Path',
    task_path_ph: 'C:\\Users\\Documents\\image.png',
    task_no_assets: 'No assets attached. Click add path to link a local file.',
    task_deliverables_title: 'Final Deliverables (The outcome of this task)',
    task_deliverables_ph: 'Manually paste or write the final approved text/markdown.',
    task_no_chat: 'No chat history yet.',
    task_view_prompt: 'View Initial Task Prompt',
    task_initial_prompt: 'Initial Prompt Rule',
    task_ai_assignee: 'AI Assignee',
    task_working: 'Working on task...',
    task_chat_ph: 'Guide the AI to adjust output, or run initial task... (Shift+Enter for newline)',
    task_send_ai: 'Send to AI',
    status_todo: 'To Do',
    status_progress: 'In Progress',
    status_review: 'Pending Review (Waiting for Human)',
    status_done: 'Done',
    btn_cancel: 'Cancel',
  },
  zh: {
    nav_projects: '项目大厅',
    nav_employees: 'AI员工',
    nav_settings: '设置',
    
    settings_title: '全局设置',
    settings_appearance: '外观',
    settings_appearance_desc: '选择你偏好的应用主题。',
    settings_theme_mode: '主题模式',
    settings_toggle: '切换至',
    settings_lang: '界面语言',
    settings_lang_desc: '选择软件界面显示的语言。',
    
    projects_title: '我的项目',
    projects_new: '新建项目',
    projects_name: '项目名称',
    projects_desc: '描述',
    projects_manager: 'AI项目经理 (可选)',
    projects_create: '创建项目',
    projects_cancel: '取消',
    projects_delete: '删除',
    projects_open: '打开工作区',
    projects_stage: '阶段:',
    
    emp_title: 'AI 员工管理',
    emp_add: '添加员工',
    emp_name: '姓名',
    emp_role: '角色职务',
    emp_provider: 'API 供应商',
    emp_model: '模型名称',
    emp_skill: '技能文件',
    emp_prompt: '系统指令(Prompt)',
    emp_save: '保存员工',
    
    ws_pm: '项目经理',
    ws_stage_research: '调研阶段',
    ws_stage_design: '方案设计',
    ws_stage_planning: '任务规划',
    ws_stage_exec: '执行阶段',
    ws_stage_maint: '后续开发',
    ws_btn_design: '开始方案设计',
    ws_btn_plan: '生成任务',
    ws_btn_finish: '确认项目完成',
    ws_btn_maint: '生成新改动任务',
    ws_chat_ph: '输入你的指令... (Shift+Enter换行)',
    ws_chat_send: '发送',
    ws_task_view: '任务视图',
    ws_graph: '拓扑图',
    ws_kanban: '看板',
    ws_add_task: '添加任务',
    ws_start_proj: '开始执行项目',
    ws_pause_proj: '暂停执行',
    
    mod_desc: '任务描述 / 限制条件',
    mod_deps: '前置依赖任务',
    mod_assign: '任务分配',
    mod_human: '人类',
    mod_predef: '预设AI员工',
    mod_custom: '自定义AI',
    mod_assets: '本地资产及上下文',
    mod_add_path: '添加路径',
    mod_deliv: '最终交付物',
    mod_run_ai: '运行AI任务',
    mod_save: '保存任务',
    mod_delete: '删除',

    pm_role_research: "你现在是一名高级项目管理，你需要和人类同事(用户)以及其他AI同事一起开发项目。现在项目正处于调研阶段，用户会告诉你他/她的项目要求，你需要理解并分析用户需求。如果客户对需求的描述不清晰，或是你不能理解用户的意图，你应当首先和用户确认直至你完全理解用户的意图。当你完全理解用户的需求后，你需要分析并确认该项目的可行性和商业价值并告知用户。在用户让你开始设计实现方案前，你暂时不需要向用户提供具体的实现计划。你只需要告诉用户该需求能否被实现，实现过程中可能会遇到的风险或挑战，以及实现后预计用户可能获得的收益。最后你要提示用户点击对话框上方的“开始方案设计”按钮，让项目进入下一阶段。",
    pm_role_design: "现在项目正处于方案设计阶段。用户已确了项目的可行性，并希望你为他设计一套执行方案。你需要告诉用户实现此项目的大致流程，以及需要用到的技术，资源，花费或是其他必要的条件。如果用户提出建议，你要判断用户的意见是否有效，然后视情况更新方案并对用户进行反馈。你要向用户确认是否赞同你的方案，若用户赞同，你要明确提示他点击对话框上方的“生成任务”按钮，让项目进入下一阶段。",
    pm_role_planning: "现在项目正处于任务规划阶段。用户已经同意了你的方案，并希望你将项目拆分成多个任务。",
    pm_role_execution: "现在项目正处于执行阶段。用户已经按照你的规划的任务开始推进项目，以后用户和你对话的时候你需要根据当前已有的任务和项目进展向用户提供建议。如果项目完成，提示用户点击顶部的“确认项目完成”按钮。",
    pm_role_maintenance: "现在项目正处于后续开发阶段。该项目已经完成，但用户可能提出后续的修改需求。如果确认到用户需求，请分析并提供用户修改方案。如果用户同意方案，请提示用户点击顶部的“生成任务”按钮。",
    pm_trigger_design: "[系统动作] 用户点击了“开始方案设计”，请立刻为用户设计一套执行方案。",
    pm_trigger_planning: "[系统动作] 用户点击了“生成任务”，请立即为你刚才设计的方案生成包含所有任务架构的特殊JSON区块返回，除此之外不要包含任何多余文字。",
    pm_trigger_maintenance: "[系统动作] 用户点击了“确认项目完成”，项目进入后续开发阶段，请说一句简短的庆祝祝福语，并表明你会继续提供后续支持。",
    pm_task_generation_success: '✅ *System:* Successfully generated and linked tasks based on the plan.',
    pm_task_generation_failed_confirm_retry: '任务生成失败，未在AI回复中检测到有效的JSON格式任务数据。是否让AI重新生成？',
    pm_task_generation_retry_prompt: '[系统警告] 你刚才输出了不符合规范的格式。你必须严格按照 ```json-task-list ... ``` 包裹且仅输出JSON。请重新生成！',
    new_task_title: '新任务',
    stage_research: '调研阶段',
    stage_design: '方案设计',
    stage_planning: '任务规划',
    stage_execution: '执行阶段',
    stage_maintenance: '后续开发',
    project_manager: '项目经理',
    btn_start_design: '开始方案设计',
    btn_generate_tasks: '生成任务',
    btn_generating_tasks: '任务生成中...',
    btn_confirm_complete: '确认项目完成',
    btn_generate_new_tasks: '生成新改动任务',
    you: '您',
    ai_thinking: 'AI正在思考...',
    ws_running_placeholder: '项目自动运行中...',

    task_title_ph: '任务标题（例如：生成缩略图）',
    task_desc: '任务描述与限制',
    task_desc_ph: '这一步具体需要完成什么？',
    task_parent_deps: '前置任务',
    task_no_deps: '暂无其他任务。',
    task_assignment: '任务分配',
    task_assign_human: '人类负责',
    task_assign_predefined: '选择AI员工',
    task_assign_custom: '自定义AI',
    task_select_ai: '-- 请选择AI员工 --',
    task_custom_sandbox: '自定义沙盒环境',
    task_api_url_ph: 'API地址 (例如：OpenAI/ComfyUI)',
    task_api_key_ph: 'API密钥',
    task_model_ph: '模型名称',
    task_prompt_ph: '具体的提示词指令...',
    task_assets_title: '本地附加文件与上下文',
    task_add_path: '添加路径',
    task_path_ph: 'C:\\Users\\Documents\\image.png',
    task_no_assets: '未附加文件。点击添加路径以链接本地文件。',
    task_deliverables_title: '最终交付物 (任务的产出)',
    task_deliverables_ph: '手动粘贴或在此输入最终确认的文本/Markdown。',
    task_no_chat: '暂无对话记录。',
    task_view_prompt: '查看初始任务提示词',
    task_initial_prompt: '初始提示规则',
    task_ai_assignee: 'AI执行者',
    task_working: '正在处理任务...',
    task_chat_ph: '指导AI调整输出，或运行初始任务... (Shift+回车换行)',
    task_send_ai: '发送给AI',
    status_todo: '待办',
    status_progress: '进行中',
    status_review: '待人类审核',
    status_done: '已完成',
    btn_cancel: '取消',
  }
};

type TranslationKey = keyof typeof translations['en'];

type I18nContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k as string
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
     const saved = localStorage.getItem('glint_lang') as Language;
     if (saved && (saved === 'en' || saved === 'zh')) {
         setLangState(saved);
     }
  }, []);

  const setLang = (l: Language) => {
     setLangState(l);
     localStorage.setItem('glint_lang', l);
  };

  const t = (key: TranslationKey) => {
     return translations[lang][key] || translations['en'][key] || key;
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useTranslation = () => useContext(I18nContext);

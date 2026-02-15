'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/I18nProvider';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Menu,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types';
import Sidebar from './Sidebar';
import DashboardFocusTasksSection from './dashboard/DashboardFocusTasksSection';

type Project = Database['public']['Tables']['projects']['Row'];
type Task = Database['public']['Tables']['tasks']['Row'];

// Cast Recharts components to any to bypass React 18 type compatibility issues
const RResponsiveContainer = ResponsiveContainer as any;
const RBarChart = BarChart as any;
const RBar = Bar as any;
const RXAxis = XAxis as any;
const RYAxis = YAxis as any;
const RCartesianGrid = CartesianGrid as any;
const RTooltip = Tooltip as any;
const RPieChart = PieChart as any;
const RPie = Pie as any;
const RCell = Cell as any;
const RLegend = Legend as any;

const priorityColors = {
  5: 'bg-red-500/20 text-red-700 dark:text-red-400',
  4: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  3: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  2: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  1: 'bg-green-500/20 text-green-700 dark:text-green-400',
};

const healthBadges = {
  Healthy: 'bg-green-500/20 text-green-700 dark:text-green-400',
  Warning: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  Critical: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

// Data fetching function
async function fetchDashboardData() {
  const supabase = createClient();

  // Fetch all projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });

  // Fetch all tasks
  const { data: tasks } = await supabase.from('tasks').select('*');

  return { projects: projects || [], tasks: tasks || [] };
}

// Calculate project health metrics
function calculateProjectHealth(projectId: string, tasks: Task[]) {
  const projectTasks = tasks.filter((t) => t.project_id === projectId);
  const total = projectTasks.length;
  const critical = projectTasks.filter((t) => t.priority >= 4).length;
  const blocked = projectTasks.filter((t) => t.status === 'blocked').length;
  const completed = projectTasks.filter((t) => t.status === 'done').length;
  const completion = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Determine health status
  let health = 'Healthy';
  if (blocked >= 3 || critical >= 3) health = 'Critical';
  else if (blocked >= 1 || critical >= 2 || completion < 30) health = 'Warning';

  return { total, critical, blocked, completed, completion, health };
}

// Get blocked tasks
function getBlockedTasks(tasks: Task[], projects: Project[]) {
  return tasks
    .filter((t) => t.status === 'blocked')
    .slice(0, 4)
    .map((task) => {
      const project = projects.find((p) => p.id === task.project_id);
      const daysBlocked = Math.floor(
        (Date.now() - new Date(task.updated_at).getTime()) /
          (1000 * 60 * 60 * 24)
      );

      return {
        id: task.id,
        title: task.title,
        project: project?.name || 'Unknown',
        projectColor: project?.color || '#94a3b8',
        priority: task.priority,
        daysBlocked,
      };
    });
}

// Get upcoming deadlines
function getUpcomingDeadlines(tasks: Task[], projects: Project[]) {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);

  return tasks
    .filter((t) => t.due_date && t.status !== 'done')
    .filter((t) => {
      if (!t.due_date) return false;
      return new Date(t.due_date) <= nextWeek;
    })
    .sort((a, b) => {
      if (!a.due_date || !b.due_date) return 0;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    })
    .slice(0, 6)
    .map((task) => {
      const project = projects.find((p) => p.id === task.project_id);
      return {
        id: task.id,
        title: task.title,
        project: project?.name || 'Unknown',
        projectColor: project?.color || '#94a3b8',
        priority: task.priority,
        dueDate: task.due_date!,
      };
    });
}

// Calculate KPIs
function calculateKPIs(tasks: Task[]) {
  return {
    total: tasks.length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    critical: tasks.filter((t) => t.priority >= 4).length,
    completed: tasks.filter((t) => t.status === 'done').length,
  };
}

export default function AnalyticsDashboard() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [dashboardData, setDashboardData] = useState<{
    projects: Project[];
    tasks: Task[];
    projectHealthData: any[];
    blockedTasks: any[];
    upcomingDeadlines: any[];
    kpis: {
      total: number;
      blocked: number;
      critical: number;
      completed: number;
    };
  }>({
    projects: [],
    tasks: [],
    projectHealthData: [],
    blockedTasks: [],
    upcomingDeadlines: [],
    kpis: { total: 0, blocked: 0, critical: 0, completed: 0 },
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    const { projects, tasks } = (await fetchDashboardData()) as any;

    const projectHealthData = projects.map((project: Project) => ({
      ...project,
      ...calculateProjectHealth(project.id, tasks),
    }));

    setDashboardData({
      projects,
      tasks,
      projectHealthData,
      blockedTasks: getBlockedTasks(tasks, projects),
      upcomingDeadlines: getUpcomingDeadlines(tasks, projects),
      kpis: calculateKPIs(tasks),
    });

    setLoading(false);
  }

  const lastUpdated = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const kpiData = [
    {
      label: t('dashboard.total_tasks'),
      value: dashboardData.kpis.total,
      icon: CheckCircle,
      color: 'bg-blue-500',
    },
    {
      label: t('dashboard.blocked_tasks'),
      value: dashboardData.kpis.blocked,
      icon: AlertCircle,
      color: 'bg-red-500',
    },
    {
      label: t('dashboard.critical_priority'),
      value: dashboardData.kpis.critical,
      icon: AlertTriangle,
      color: 'bg-orange-500',
    },
    {
      label: t('dashboard.completed'),
      value: dashboardData.kpis.completed,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <Sidebar
        projects={dashboardData.projects}
        selectedProject={null}
        selectedCategory={selectedCategory}
        showArchived={showArchived}
        onSelectProject={(id) => {
          if (id) {
            router.push(`/project/${id}`);
          } else {
            router.push('/dashboard');
          }
        }}
        onCategoryChange={setSelectedCategory}
        onShowArchivedChange={setShowArchived}
        onProjectUpdated={() => {
          loadDashboardData();
        }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        overlayOnly
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 1. TOP NAVIGATION BAR */}
        <div className="bg-primary text-primary-foreground shadow-xl">
          <div className="px-4 md:px-6 py-4 flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-primary-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
              aria-label={t('sidebar.navigation')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold truncate min-w-0">
              Mutech Labs - {t('dashboard.title')}
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">
                {t('dashboard.loading_data')}
              </div>
            </div>
          ) : (
            <>
              {/* 3. KPI CARDS ROW - 2x2 on mobile/tablet, 4 in a row on large */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {kpiData.map((kpi, index) => {
                  const Icon = kpi.icon;
                  return (
                    <div
                      key={index}
                      className={`${kpi.color} rounded-lg shadow p-4 sm:p-6 text-white hover:shadow-lg transition-shadow`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 sm:mb-2">
                        <Icon className="w-6 h-6 sm:w-8 sm:h-8 flex-shrink-0" />
                        <div className="text-right min-w-0">
                          <div className="text-2xl sm:text-3xl font-bold">
                            {kpi.value}
                          </div>
                          <div className="text-xs sm:text-sm opacity-90 truncate">
                            {kpi.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DASHBOARD FOCUS TASKS SECTION */}
              <DashboardFocusTasksSection />

              {/* 6. BOTTOM ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Blocked Tasks */}
                <div className="bg-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-border">
                  <h2 className="text-xl font-bold text-foreground mb-4">
                    {t('dashboard.blocked_tasks_section')}
                  </h2>
                  <div className="space-y-3">
                    {dashboardData.blockedTasks.length === 0 ? (
                      <div className="text-muted-foreground text-sm py-4">
                        {t('dashboard.no_blocked_tasks')}
                      </div>
                    ) : (
                      dashboardData.blockedTasks.map((task) => (
                        <div
                          key={task.id}
                          className="border-l-4 border-red-500 bg-red-500/10 dark:bg-red-500/20 rounded-r-lg p-4 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors border border-border"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-medium text-foreground flex-1">
                              {task.title}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}
                            >
                              P{task.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: task.projectColor }}
                            />
                            <span>{task.project}</span>
                            <span className="text-red-600 dark:text-red-400 font-medium ml-auto">
                              {t('dashboard.blocked_days', {
                                days: task.daysBlocked,
                              })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Upcoming Deadlines */}
                <div className="bg-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-border">
                  <h2 className="text-xl font-bold text-foreground mb-4">
                    {t('dashboard.upcoming_deadlines')}
                  </h2>
                  <div className="space-y-3">
                    {dashboardData.upcomingDeadlines.length === 0 ? (
                      <div className="text-muted-foreground text-sm py-4">
                        {t('dashboard.no_upcoming_deadlines')}
                      </div>
                    ) : (
                      dashboardData.upcomingDeadlines.map((task) => (
                        <div
                          key={task.id}
                          className="border-l-4 border-blue-500 bg-blue-500/10 dark:bg-blue-500/20 rounded-r-lg p-4 hover:bg-blue-500/20 dark:hover:bg-blue-500/30 transition-colors"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-medium text-foreground flex-1">
                              {task.title}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}
                            >
                              P{task.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: task.projectColor }}
                            />
                            <span>{task.project}</span>
                            <Calendar className="w-4 h-4 ml-auto" />
                            <span className="text-blue-500 dark:text-blue-400 font-medium">
                              {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

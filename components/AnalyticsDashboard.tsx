'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, TrendingUp, Calendar, LogOut, Plus } from 'lucide-react'
import { getCategoryLabel } from '@/lib/constants'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'
import Sidebar from './Sidebar'
import { AddProjectModal } from './AddProjectModal'
import { Button } from './ui/button'
import DashboardFocusTasksSection from './dashboard/DashboardFocusTasksSection'

type Project = Database['public']['Tables']['projects']['Row']
type Task = Database['public']['Tables']['tasks']['Row']

// Cast Recharts components to any to bypass React 18 type compatibility issues
const RResponsiveContainer = ResponsiveContainer as any
const RBarChart = BarChart as any
const RBar = Bar as any
const RXAxis = XAxis as any
const RYAxis = YAxis as any
const RCartesianGrid = CartesianGrid as any
const RTooltip = Tooltip as any
const RPieChart = PieChart as any
const RPie = Pie as any
const RCell = Cell as any
const RLegend = Legend as any

const priorityColors = {
    5: 'bg-red-500/20 text-red-700 dark:text-red-400',
    4: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
    3: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    2: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    1: 'bg-green-500/20 text-green-700 dark:text-green-400',
}

const healthBadges = {
    Healthy: 'bg-green-500/20 text-green-700 dark:text-green-400',
    Warning: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    Critical: 'bg-red-500/20 text-red-700 dark:text-red-400',
}

// Data fetching function
async function fetchDashboardData() {
    const supabase = createClient()

    // Fetch all projects
    const { data: projects } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: true })

    // Fetch all tasks
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*')

    return { projects: projects || [], tasks: tasks || [] }
}

// Calculate project health metrics
function calculateProjectHealth(projectId: string, tasks: Task[]) {
    const projectTasks = tasks.filter(t => t.project_id === projectId)
    const total = projectTasks.length
    const critical = projectTasks.filter(t => t.priority >= 4).length
    const blocked = projectTasks.filter(t => t.status === 'blocked').length
    const completed = projectTasks.filter(t => t.status === 'done').length
    const completion = total > 0 ? Math.round((completed / total) * 100) : 0

    // Determine health status
    let health = 'Healthy'
    if (blocked >= 3 || critical >= 3) health = 'Critical'
    else if (blocked >= 1 || critical >= 2 || completion < 30) health = 'Warning'

    return { total, critical, blocked, completed, completion, health }
}

// Get blocked tasks
function getBlockedTasks(tasks: Task[], projects: Project[]) {
    return tasks
        .filter(t => t.status === 'blocked')
        .slice(0, 4)
        .map(task => {
            const project = projects.find(p => p.id === task.project_id)
            const daysBlocked = Math.floor(
                (Date.now() - new Date(task.updated_at).getTime()) / (1000 * 60 * 60 * 24)
            )

            return {
                id: task.id,
                title: task.title,
                project: project?.name || 'Unknown',
                projectColor: project?.color || '#94a3b8',
                priority: task.priority,
                daysBlocked
            }
        })
}

// Get upcoming deadlines
function getUpcomingDeadlines(tasks: Task[], projects: Project[]) {
    const today = new Date()
    const nextWeek = new Date()
    nextWeek.setDate(today.getDate() + 7)

    return tasks
        .filter(t => t.due_date && t.status !== 'done')
        .filter(t => {
            if (!t.due_date) return false
            return new Date(t.due_date) <= nextWeek
        })
        .sort((a, b) => {
            if (!a.due_date || !b.due_date) return 0
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        })
        .slice(0, 6)
        .map(task => {
            const project = projects.find(p => p.id === task.project_id)
            return {
                id: task.id,
                title: task.title,
                project: project?.name || 'Unknown',
                projectColor: project?.color || '#94a3b8',
                priority: task.priority,
                dueDate: task.due_date!
            }
        })
}

// Calculate KPIs
function calculateKPIs(tasks: Task[]) {
    return {
        total: tasks.length,
        blocked: tasks.filter(t => t.status === 'blocked').length,
        critical: tasks.filter(t => t.priority >= 4).length,
        completed: tasks.filter(t => t.status === 'done').length
    }
}

export default function AnalyticsDashboard() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [dashboardData, setDashboardData] = useState<{
        projects: Project[]
        tasks: Task[]
        projectHealthData: any[]
        blockedTasks: any[]
        upcomingDeadlines: any[]
        kpis: { total: number; blocked: number; critical: number; completed: number }
    }>({
        projects: [],
        tasks: [],
        projectHealthData: [],
        blockedTasks: [],
        upcomingDeadlines: [],
        kpis: { total: 0, blocked: 0, critical: 0, completed: 0 }
    })
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [showArchived, setShowArchived] = useState(false)
    const [loading, setLoading] = useState(true)
    const [mounted, setMounted] = useState(false)
    const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false)

    useEffect(() => {
        setMounted(true)
        loadDashboardData()
    }, [])

    async function loadDashboardData() {
        setLoading(true)
        const { projects, tasks } = await fetchDashboardData() as any

        const projectHealthData = projects.map((project: Project) => ({
            ...project,
            ...calculateProjectHealth(project.id, tasks)
        }))

        setDashboardData({
            projects,
            tasks,
            projectHealthData,
            blockedTasks: getBlockedTasks(tasks, projects),
            upcomingDeadlines: getUpcomingDeadlines(tasks, projects),
            kpis: calculateKPIs(tasks)
        })

        setLoading(false)
    }

    const lastUpdated = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })


    const kpiData = [
        { label: 'Total Tasks', value: dashboardData.kpis.total, icon: CheckCircle, color: 'bg-blue-500' },
        { label: 'Blocked Tasks', value: dashboardData.kpis.blocked, icon: AlertCircle, color: 'bg-red-500' },
        { label: 'Critical Priority', value: dashboardData.kpis.critical, icon: AlertTriangle, color: 'bg-orange-500' },
        { label: 'Completed', value: dashboardData.kpis.completed, icon: TrendingUp, color: 'bg-green-500' },
    ]

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
                        router.push(`/project/${id}`)
                    } else {
                        router.push('/dashboard')
                    }
                }}
                onCategoryChange={setSelectedCategory}
                onShowArchivedChange={setShowArchived}
                onProjectUpdated={() => {
                    loadDashboardData()
                }}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 1. TOP NAVIGATION BAR */}
                <div className="bg-primary text-primary-foreground shadow-xl">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h1 className="text-xl font-bold">Mutech Labs - Dashboard</h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button
                                onClick={() => setIsAddProjectModalOpen(true)}
                                variant="default"
                                size="sm"
                                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Create Project
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                    await supabase.auth.signOut()
                                    router.push('/')
                                }}
                                className="text-primary-foreground hover:bg-primary/80"
                            >
                                <LogOut className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-muted-foreground">Loading dashboard data...</div>
                        </div>
                    ) : (
                        <>


                            {/* 3. KPI CARDS ROW */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {kpiData.map((kpi, index) => {
                                    const Icon = kpi.icon
                                    return (
                                        <div
                                            key={index}
                                            className={`${kpi.color} rounded-lg shadow p-6 text-white hover:shadow-lg transition-shadow`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <Icon className="w-8 h-8" />
                                                <div className="text-right">
                                                    <div className="text-3xl font-bold">{kpi.value}</div>
                                                    <div className="text-sm opacity-90">{kpi.label}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* DASHBOARD FOCUS TASKS SECTION */}
                            <DashboardFocusTasksSection />

                            {/* 2. PROJECT HEALTH OVERVIEW */}
                            <div className="bg-card rounded-lg shadow p-6 border border-border">
                                <h2 className="text-xl font-bold text-foreground mb-4">Project Health Overview</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {dashboardData.projectHealthData.map((project) => (
                                        <div
                                            key={project.id}
                                            onClick={() => router.push(`/project/${project.id}`)}
                                            className="border border-border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer bg-background hover:bg-accent/50"
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-4 h-4 rounded-full"
                                                        style={{ backgroundColor: project.color }}
                                                    />
                                                    <h3 className="font-semibold text-foreground">{project.name}</h3>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">{getCategoryLabel(project.category)}</span>
                                                    {project.category === 'archived' && (
                                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                                            Archived
                                                        </span>
                                                    )}
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${healthBadges[project.health as keyof typeof healthBadges]}`}>
                                                        {project.health}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                                                <div>
                                                    <span className="text-muted-foreground">Total:</span>
                                                    <span className="font-semibold ml-1">{project.total}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Critical:</span>
                                                    <span className="font-semibold ml-1 text-red-600 dark:text-red-400">{project.critical}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Blocked:</span>
                                                    <span className="font-semibold ml-1 text-orange-600 dark:text-orange-400">{project.blocked}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Completed:</span>
                                                    <span className="font-semibold ml-1 text-green-600 dark:text-green-400">{project.completed}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                                    <span>Progress</span>
                                                    <span>{project.completion}%</span>
                                                </div>
                                                <div className="w-full bg-muted rounded-full h-2">
                                                    <div
                                                        className="bg-blue-600 h-2 rounded-full transition-all"
                                                        style={{ width: `${project.completion}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>


                            {/* 6. BOTTOM ROW */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Blocked Tasks */}
                                <div className="bg-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-border">
                                    <h2 className="text-xl font-bold text-foreground mb-4">Blocked Tasks</h2>
                                    <div className="space-y-3">
                                        {dashboardData.blockedTasks.length === 0 ? (
                                            <div className="text-muted-foreground text-sm py-4">No blocked tasks</div>
                                        ) : (
                                            dashboardData.blockedTasks.map((task) => (
                                                <div
                                                    key={task.id}
                                                    className="border-l-4 border-red-500 bg-red-500/10 dark:bg-red-500/20 rounded-r-lg p-4 hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors border border-border"
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <h3 className="font-medium text-foreground flex-1">{task.title}</h3>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
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
                                                            Blocked {task.daysBlocked} days
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Upcoming Deadlines */}
                                <div className="bg-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow border border-border">
                                    <h2 className="text-xl font-bold text-foreground mb-4">Upcoming Deadlines</h2>
                                    <div className="space-y-3">
                                        {dashboardData.upcomingDeadlines.length === 0 ? (
                                            <div className="text-muted-foreground text-sm py-4">No upcoming deadlines</div>
                                        ) : (
                                            dashboardData.upcomingDeadlines.map((task) => (
                                                <div
                                                    key={task.id}
                                                    className="border-l-4 border-blue-500 bg-blue-500/10 dark:bg-blue-500/20 rounded-r-lg p-4 hover:bg-blue-500/20 dark:hover:bg-blue-500/30 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between mb-2">
                                                        <h3 className="font-medium text-foreground flex-1">{task.title}</h3>
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
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
            <AddProjectModal
                isOpen={isAddProjectModalOpen}
                onClose={() => setIsAddProjectModalOpen(false)}
                onProjectAdded={() => {
                    loadDashboardData()
                    setIsAddProjectModalOpen(false)
                }}
            />
        </div>
    )
}

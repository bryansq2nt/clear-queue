'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, TrendingUp, Calendar, LayoutDashboard } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']

// Mock data
const mockProjects = [
    { id: 1, name: 'Assistant 360', color: '#22c55e', health: 'Healthy', total: 45, critical: 2, blocked: 5, completed: 38, completion: 84 },
    { id: 2, name: 'Sabor de emociones', color: '#a855f7', health: 'Warning', total: 32, critical: 5, blocked: 8, completed: 19, completion: 59 },
    { id: 3, name: 'Luxuria Pure Cleaning', color: '#eab308', health: 'Healthy', total: 28, critical: 1, blocked: 2, completed: 25, completion: 89 },
    { id: 4, name: 'Safety Footwear', color: '#64748b', health: 'Critical', total: 67, critical: 12, blocked: 15, completed: 40, completion: 60 },
    { id: 5, name: 'Mutech Business', color: '#ef4444', health: 'Warning', total: 41, critical: 6, blocked: 7, completed: 28, completion: 68 },
    { id: 6, name: 'Extergen Group', color: '#f97316', health: 'Healthy', total: 23, critical: 0, blocked: 1, completed: 22, completion: 96 },
]

const weeklyWorkData = [
    { project: 'Assistant 360', tasks: 12, color: '#22c55e' },
    { project: 'Sabor', tasks: 8, color: '#a855f7' },
    { project: 'Luxuria', tasks: 15, color: '#eab308' },
    { project: 'Safety', tasks: 20, color: '#64748b' },
    { project: 'Mutech', tasks: 10, color: '#ef4444' },
    { project: 'Extergen', tasks: 6, color: '#f97316' },
]

const monthlyProgressData = [
    { name: 'Week 1', value: 45, color: '#3b82f6' },
    { name: 'Week 2', value: 52, color: '#8b5cf6' },
    { name: 'Week 3', value: 38, color: '#ec4899' },
    { name: 'Week 4', value: 61, color: '#f59e0b' },
    { name: 'Current', value: 28, color: '#10b981' },
]

const blockedTasks = [
    { id: 1, title: 'Obtener el negocio del cuerpo del mensaje', project: 'Assistant 360', projectColor: '#22c55e', priority: 3, daysBlocked: 5 },
    { id: 2, title: 'Whatsapp message integration', project: 'Assistant 360', projectColor: '#22c55e', priority: 5, daysBlocked: 3 },
    { id: 3, title: 'Analizar ads analytics', project: 'Sabor de emociones', projectColor: '#a855f7', priority: 5, daysBlocked: 7 },
    { id: 4, title: 'Print new cards', project: 'Sabor de emociones', projectColor: '#a855f7', priority: 3, daysBlocked: 2 },
]

const upcomingDeadlines = [
    { id: 1, title: 'Deploy init version', project: 'Clear Queue', projectColor: '#3b82f6', priority: 5, dueDate: '2026-01-17' },
    { id: 2, title: 'Update shop benchmade section', project: 'Safety Footwear', projectColor: '#64748b', priority: 5, dueDate: '2026-01-18' },
    { id: 3, title: 'Add more payment options', project: 'Safety Footwear', projectColor: '#64748b', priority: 5, dueDate: '2026-01-19' },
    { id: 4, title: 'Add price to starter package', project: 'Mutech Business', projectColor: '#ef4444', priority: 5, dueDate: '2026-01-21' },
    { id: 5, title: 'Redirect clients after submit', project: 'Mutech Business', projectColor: '#ef4444', priority: 5, dueDate: '2026-01-22' },
    { id: 6, title: 'LLC velo corporativo', project: 'Mutech Business', projectColor: '#ef4444', priority: 5, dueDate: '2026-01-23' },
]

const kpiData = [
    { label: 'Total Tasks', value: 236, icon: CheckCircle, color: 'bg-blue-500' },
    { label: 'Blocked Tasks', value: 38, icon: AlertCircle, color: 'bg-red-500' },
    { label: 'Critical Priority', value: 26, icon: AlertTriangle, color: 'bg-orange-500' },
    { label: 'Completed', value: 172, icon: TrendingUp, color: 'bg-green-500' },
]

const priorityColors = {
    5: 'bg-red-100 text-red-800',
    4: 'bg-orange-100 text-orange-800',
    3: 'bg-yellow-100 text-yellow-800',
    2: 'bg-blue-100 text-blue-800',
    1: 'bg-green-100 text-green-800',
}

const healthBadges = {
    Healthy: 'bg-green-100 text-green-800',
    Warning: 'bg-yellow-100 text-yellow-800',
    Critical: 'bg-red-100 text-red-800',
}

export default function AnalyticsDashboard() {
    const pathname = usePathname()
    const router = useRouter()
    const [projects, setProjects] = useState<Project[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        loadProjects()
    }, [])

    async function loadProjects() {
        setLoading(true)
        const { data } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: true })

        if (data) setProjects(data)
        setLoading(false)
    }

    const lastUpdated = new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })

    const totalCompleted = monthlyProgressData.reduce((sum, item) => sum + item.value, 0)
    const averageCompleted = Math.round(totalCompleted / monthlyProgressData.length)

    return (
        <div className="flex h-screen bg-slate-50">
            {/* Left Sidebar */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6">
                    {/* Navigation */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                            Navigation
                        </label>
                        <div className="space-y-1">
                            <Link
                                href="/dashboard"
                                className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                                    pathname === '/dashboard'
                                        ? 'bg-slate-100 text-slate-900 font-medium'
                                        : 'text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </Link>
                        </div>
                    </div>

                    {/* Projects List */}
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                            Projects
                        </label>
                        <div className="space-y-1">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className={cn(
                                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                                    pathname === '/dashboard'
                                        ? 'bg-slate-100 text-slate-900 font-medium'
                                        : 'text-slate-600 hover:bg-slate-50'
                                )}
                            >
                                All Projects
                            </button>
                            {loading ? (
                                <div className="text-sm text-slate-500 px-3 py-2 rounded-md">Loading projects...</div>
                            ) : (
                                projects.map((project) => (
                                    <button
                                        key={project.id}
                                        onClick={() => router.push(`/project/${project.id}`)}
                                        className={cn(
                                            'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2',
                                            pathname === `/project/${project.id}`
                                                ? 'bg-slate-100 text-slate-900 font-medium'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: project.color || '#94a3b8' }}
                                        />
                                        <span className="truncate">{project.name}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* 1. TOP NAVIGATION BAR */}
                <div className="bg-slate-900 text-white shadow-lg h-16 flex items-center justify-between px-6">
                    <h1 className="text-xl font-bold">Mutech Labs - Dashboard</h1>
                    <span className="text-slate-300 text-sm">Last updated: {lastUpdated}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* 2. PROJECT HEALTH OVERVIEW */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Project Health Overview</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {mockProjects.map((project) => (
                                <div
                                    key={project.id}
                                    className="border border-slate-200 rounded-lg p-4 hover:shadow-lg transition-shadow"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-4 h-4 rounded-full"
                                                style={{ backgroundColor: project.color }}
                                            />
                                            <h3 className="font-semibold text-slate-900">{project.name}</h3>
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${healthBadges[project.health as keyof typeof healthBadges]}`}>
                                            {project.health}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                                        <div>
                                            <span className="text-slate-500">Total:</span>
                                            <span className="font-semibold ml-1">{project.total}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Critical:</span>
                                            <span className="font-semibold ml-1 text-red-600">{project.critical}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Blocked:</span>
                                            <span className="font-semibold ml-1 text-orange-600">{project.blocked}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500">Completed:</span>
                                            <span className="font-semibold ml-1 text-green-600">{project.completed}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs text-slate-600 mb-1">
                                            <span>Progress</span>
                                            <span>{project.completion}%</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2">
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

                    {/* 3. WEEKLY WORK DISTRIBUTION */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Weekly Work Distribution</h2>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={weeklyWorkData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="project" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="tasks" radius={[8, 8, 0, 0]}>
                                    {weeklyWorkData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 4. MONTHLY PROGRESS */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Monthly Progress</h2>
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1">
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={monthlyProgressData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }: { name: string; percent: number }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={100}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {monthlyProgressData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex flex-col justify-center gap-4">
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-slate-900">{totalCompleted}</div>
                                    <div className="text-sm text-slate-600">Total Completed</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-slate-900">{averageCompleted}</div>
                                    <div className="text-sm text-slate-600">Average per Week</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. KPI CARDS ROW */}
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

                    {/* 6. BOTTOM ROW */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Blocked Tasks */}
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                            <h2 className="text-xl font-bold text-slate-900 mb-4">Blocked Tasks</h2>
                            <div className="space-y-3">
                                {blockedTasks.map((task) => (
                                    <div
                                        key={task.id}
                                        className="border-l-4 border-red-500 bg-red-50 rounded-r-lg p-4 hover:bg-red-100 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-medium text-slate-900 flex-1">{task.title}</h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
                                                P{task.priority}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: task.projectColor }}
                                            />
                                            <span>{task.project}</span>
                                            <span className="text-red-600 font-medium ml-auto">
                                                Blocked {task.daysBlocked} days
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Upcoming Deadlines */}
                        <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                            <h2 className="text-xl font-bold text-slate-900 mb-4">Upcoming Deadlines</h2>
                            <div className="space-y-3">
                                {upcomingDeadlines.map((task) => (
                                    <div
                                        key={task.id}
                                        className="border-l-4 border-blue-500 bg-blue-50 rounded-r-lg p-4 hover:bg-blue-100 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <h3 className="font-medium text-slate-900 flex-1">{task.title}</h3>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColors[task.priority as keyof typeof priorityColors]}`}>
                                                P{task.priority}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: task.projectColor }}
                                            />
                                            <span>{task.project}</span>
                                            <Calendar className="w-4 h-4 ml-auto" />
                                            <span className="text-blue-600 font-medium">
                                                {new Date(task.dueDate).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}


"use client";

import Link from 'next/link';
import { PageHeader } from "@/components/shared/PageHeader";
import { KeyMetricCard } from "@/components/dashboard/KeyMetricsCard";
import { AnalyticsChart } from "@/components/dashboard/AnalyticsChart"; // For bar chart
import { PageStatusPieChart } from "@/components/dashboard/PageStatusPieChart"; // New pie chart component
import { KeepNotes } from "@/components/dashboard/KeepNotes";
import type { RecentActivityItem } from "@/components/dashboard/RecentActivityFeed"; 
import { QuickActions } from "@/components/dashboard/QuickActions";
import { FileText, Files, Grid, BarChart3, Users, ExternalLink, Edit2, Settings, FileClock, Loader2, ListChecks, ShieldAlert, Activity, UserPlus, Info, PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, Timestamp, getCountFromServer } from 'firebase/firestore';
import type { Page as PageData, PageStatus } from '@/app/(app)/pages/page';
import type { ContentBlock } from '@/app/(app)/content-blocks/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface DashboardMetrics {
  totalPages: number;
  totalFiles: number; // Assuming mediaItems for files
  totalContentBlocks: number;
  totalUsers: number;
}

interface AuditLogEntry {
  id: string;
  userName: string;
  action: string;
  entityType?: string;
  entityName?: string;
  timestamp: string;
}

interface PageStatusData {
  name: PageStatus;
  value: number;
  fill: string; // For pie chart cell color
}

interface ContentTypeOverviewData {
  type: string;
  count: number;
}


export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentItems, setRecentItems] = useState<RecentActivityItem[]>([]);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditLogEntry[]>([]);
  const [pageStatusData, setPageStatusData] = useState<PageStatusData[]>([]);
  const [contentTypeData, setContentTypeData] = useState<ContentTypeOverviewData[]>([]);

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingRecentContent, setLoadingRecentContent] = useState(true);
  const [loadingRecentAuditLogs, setLoadingRecentAuditLogs] = useState(true);
  const [loadingChartData, setLoadingChartData] = useState(true);

  const gaDashboardUrl = "https://analytics.google.com/analytics/web/?authuser=1#/p491858320/reports/reportinghub?params=_u..nav%3Dmaui";

  const statusColors: Record<PageStatus, string> = {
    Draft: "hsl(var(--chart-1))", 
    Published: "hsl(var(--chart-2))",
    Review: "hsl(var(--chart-3))",
  };


  useEffect(() => {
    async function fetchDashboardData() {
      setLoadingMetrics(true);
      setLoadingRecentContent(true);
      setLoadingRecentAuditLogs(true);
      setLoadingChartData(true);

      try {
        const pagesCol = collection(db, "pages");
        const filesCol = collection(db, "mediaItems"); 
        const blocksCol = collection(db, "contentBlocks");
        const usersCol = collection(db, "users");

        const [pagesSnapshot, filesSnapshot, blocksSnapshot, usersSnapshot, allPagesDocs] = await Promise.all([
          getCountFromServer(pagesCol),
          getCountFromServer(filesCol),
          getCountFromServer(blocksCol),
          getCountFromServer(usersCol),
          getDocs(pagesCol), 
        ]);
        
        const fetchedMetrics = {
          totalPages: pagesSnapshot.data().count,
          totalFiles: filesSnapshot.data().count,
          totalContentBlocks: blocksSnapshot.data().count,
          totalUsers: usersSnapshot.data().count,
        };
        setMetrics(fetchedMetrics);
        
        const statusCounts: Record<PageStatus, number> = { Draft: 0, Published: 0, Review: 0 };
        allPagesDocs.forEach(doc => {
          const page = doc.data() as PageData;
          if (page.status && statusCounts[page.status] !== undefined) {
            statusCounts[page.status]++;
          } else {
            statusCounts.Draft++; 
          }
        });
        const pieData = Object.entries(statusCounts).map(([name, value]) => ({
          name: name as PageStatus,
          value,
          fill: statusColors[name as PageStatus] || statusColors.Draft,
        }));
        setPageStatusData(pieData);

        setContentTypeData([
          { type: 'Pages', count: fetchedMetrics.totalPages },
          { type: 'Blocks', count: fetchedMetrics.totalContentBlocks },
          { type: 'Users', count: fetchedMetrics.totalUsers },
          { type: 'Media', count: fetchedMetrics.totalFiles },
        ]);

        const recentPagesQuery = query(collection(db, "pages"), orderBy("updatedAt", "desc"), limit(3));
        const recentBlocksQuery = query(collection(db, "contentBlocks"), orderBy("updatedAt", "desc"), limit(2));

        const [recentPagesSnap, recentBlocksSnap] = await Promise.all([
          getDocs(recentPagesQuery),
          getDocs(recentBlocksQuery),
        ]);

        const fetchedRecentItems: RecentActivityItem[] = [];

        recentPagesSnap.forEach(doc => {
          const page = doc.data() as PageData;
          fetchedRecentItems.push({
            id: doc.id,
            title: page.title,
            type: "Page",
            lastModified: page.updatedAt instanceof Timestamp ? page.updatedAt.toDate().toLocaleDateString() : 'N/A',
            editor: page.author || 'Unknown',
            url: `/pages`,
            icon: FileText,
          });
        });

        recentBlocksSnap.forEach(doc => {
          const block = doc.data() as ContentBlock;
           fetchedRecentItems.push({
            id: doc.id,
            title: block.name,
            type: "Block",
            lastModified: block.updatedAt instanceof Timestamp ? block.updatedAt.toDate().toLocaleDateString() : 'N/A',
            editor: 'N/A', 
            url: `/content-blocks`,
            icon: Grid,
          });
        });
        
        fetchedRecentItems.sort((a, b) => {
            const dateA = new Date(a.lastModified === 'N/A' ? 0 : a.lastModified);
            const dateB = new Date(b.lastModified === 'N/A' ? 0 : b.lastModified);
            return dateB.getTime() - dateA.getTime();
        });
        setRecentItems(fetchedRecentItems.slice(0, 5));
        
        const auditLogsQuery = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(5));
        const auditLogsSnapshot = await getDocs(auditLogsQuery);
        const fetchedAuditLogs = auditLogsSnapshot.docs.map(doc => {
            const data = doc.data();
            const ts = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date();
            return {
                id: doc.id,
                userName: data.userName || data.userId || 'System',
                action: data.action || 'Unknown Action',
                entityType: data.entityType,
                entityName: data.entityName || data.entityId,
                timestamp: ts.toLocaleDateString() + ' ' + ts.toLocaleTimeString(),
            };
        });
        setRecentAuditLogs(fetchedAuditLogs);
        
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoadingMetrics(false);
        setLoadingRecentContent(false);
        setLoadingRecentAuditLogs(false);
        setLoadingChartData(false);
      }
    }
    fetchDashboardData();
  }, []);


  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your Apollo CMS activity." />

      <QuickActions /> 

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {loadingMetrics || !metrics ? (
            <>
                <KeyMetricCard title="Total Pages" value={<Loader2 className="h-5 w-5 animate-spin" />} icon={FileText} />
                <KeyMetricCard title="Total Media Files" value={<Loader2 className="h-5 w-5 animate-spin" />} icon={Files} />
                <KeyMetricCard title="Content Blocks" value={<Loader2 className="h-5 w-5 animate-spin" />} icon={Grid} />
                <KeyMetricCard title="Total Users" value={<Loader2 className="h-5 w-5 animate-spin" />} icon={Users} />
            </>
        ) : (
            <>
                <KeyMetricCard title="Total Pages" value={metrics.totalPages} icon={FileText} description="Published & drafts" />
                <KeyMetricCard title="Total Media Files" value={metrics.totalFiles} icon={Files} description="In media library" />
                <KeyMetricCard title="Content Blocks" value={metrics.totalContentBlocks} icon={Grid} description="Reusable content units" />
                <KeyMetricCard title="Total Users" value={metrics.totalUsers} icon={Users} description="Registered accounts" />
            </>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {loadingChartData ? (
            <Card><CardContent className="flex items-center justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading chart data...</p></CardContent></Card>
        ) : (
             <PageStatusPieChart data={pageStatusData} />
        )}
       {loadingChartData || !metrics ? (
            <Card><CardContent className="flex items-center justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading chart data...</p></CardContent></Card>
        ) : (
            <AnalyticsChart 
              title="Content Type Overview" 
              description="Total count of main content types in the CMS."
              data={contentTypeData}
              dataKeyX="type"
              dataKeysY={[
                { key: "count", name: "Count", color: "hsl(var(--chart-4))" },
              ]}
            />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div> {/* Column 1 for Tasks */}
          <KeepNotes />
        </div>
        <div> {/* Column 2 for Recent Content */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileClock className="h-5 w-5" />
                Recently Modified Content
              </CardTitle>
              <CardDescription>Quick access to recently updated items in the CMS.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRecentContent ? (
                <div className="flex justify-center items-center h-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recentItems.length > 0 ? (
                <div className="space-y-2">
                  {recentItems.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                        <div className="flex items-center gap-3">
                          <ItemIcon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <Link href={item.url} className="font-medium text-sm hover:underline">{item.title}</Link>
                            <div className="text-xs text-muted-foreground">
                              <Badge variant="outline" className="mr-1.5 text-xs">{item.type}</Badge>
                              Modified by {item.editor} &bull; {item.lastModified}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" asChild className="text-xs shrink-0">
                          <Link href={item.type === 'Page' ? `/pages?edit=${item.id}` : `/content-blocks?edit=${item.id}`}><Edit2 className="mr-1 h-3 w-3" /> Edit</Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recently modified items.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5" />
                    Recent Audit Log Activity
                </CardTitle>
                <CardDescription>A quick glance at the latest system activities.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
                <Link href="/audit-logs">
                    <ShieldAlert className="mr-2 h-4 w-4"/> View All Audit Logs
                </Link>
            </Button>
        </CardHeader>
        <CardContent>
            {loadingRecentAuditLogs ? (
                <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
            ) : recentAuditLogs.length > 0 ? (
                <ScrollArea className="h-[250px]">
                <div className="space-y-4">
                    {recentAuditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 mt-1">
                            <AvatarImage src={`https://placehold.co/40x40.png?text=${log.userName.substring(0,1)}`} alt={log.userName} data-ai-hint="user avatar"/>
                            <AvatarFallback>{log.userName.substring(0,2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                        <div className="text-sm font-medium leading-none">
                            <span className="font-semibold">{log.userName}</span> {log.action.toLowerCase().replace(/_/g, ' ')} {log.entityType && <Badge variant="secondary" className="ml-1 text-xs align-middle">{log.entityType}</Badge>} <span className="text-muted-foreground">{log.entityName && log.entityName !== log.id ? `"${log.entityName}"` : ''}</span>.
                        </div>
                        <p className="text-xs text-muted-foreground">{log.timestamp}</p>
                        </div>
                    </div>
                    ))}
                </div>
                </ScrollArea>
            ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent audit log activity.</p>
            )}
        </CardContent>
      </Card>

      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Google Analytics Dashboard Access
            </CardTitle>
            <CardDescription>
              Direct link to your Google Analytics dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 border border-amber-500 bg-amber-50 text-amber-700 rounded-md text-sm flex items-start">
              <Info className="h-5 w-5 mr-2 mt-0.5 shrink-0"/>
              <div>
                Click the button below to open your Google Analytics dashboard in a new tab.
                If you encounter issues accessing it (e.g., login screen, errors), it might be because:
                <ul className="list-disc pl-5 mt-1">
                  <li>You are not logged into the correct Google account in your browser.</li>
                  <li>The Google account you are using does not have permission to view this GA Property.</li>
                </ul>
                 Ensure you have the necessary permissions and are logged into the appropriate Google account. Contact your administrator if you believe you should have access. The target Property ID for this link is `491858320`.
              </div>
            </div>
            <Button asChild>
              <a href={gaDashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                Open Google Analytics <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
      </Card>
    </div>
  );
}

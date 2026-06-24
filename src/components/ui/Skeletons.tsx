'use client';

export function CardSkeleton() {
  return (
    <div className="card h-40 flex flex-col justify-between animate-pulse">
      <div className="space-y-3">
        <div className="h-4 bg-[#EBEBEB] w-2/3 rounded" />
        <div className="h-3 bg-[#EBEBEB] w-1/3 rounded" />
      </div>
      <div className="h-8 bg-[#EBEBEB] w-1/4 rounded mt-4" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Semester progress header skeleton */}
      <div className="space-y-3">
        <div className="h-6 bg-[#EBEBEB] w-1/3 rounded" />
        <div className="h-2.5 bg-[#EBEBEB] w-full rounded" />
      </div>

      {/* Grid of subjects */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="card h-48 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-2.5 w-1/2">
              <div className="h-4 bg-[#EBEBEB] rounded" />
              <div className="h-3 bg-[#EBEBEB] w-1/3 rounded" />
            </div>
            <div className="w-16 h-16 rounded-full bg-[#EBEBEB]" />
          </div>
          <div className="h-4 bg-[#EBEBEB] w-1/3 rounded mt-4" />
        </div>
        <div className="card h-48 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="space-y-2.5 w-1/2">
              <div className="h-4 bg-[#EBEBEB] rounded" />
              <div className="h-3 bg-[#EBEBEB] w-1/3 rounded" />
            </div>
            <div className="w-16 h-16 rounded-full bg-[#EBEBEB]" />
          </div>
          <div className="h-4 bg-[#EBEBEB] w-1/3 rounded mt-4" />
        </div>
      </div>

      {/* Overall stats card skeleton */}
      <div className="card h-32 flex flex-col justify-between">
        <div className="h-4 bg-[#EBEBEB] w-1/4 rounded" />
        <div className="h-3 bg-[#EBEBEB] w-full rounded" />
        <div className="h-3 bg-[#EBEBEB] w-full rounded" />
      </div>
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-6 bg-[#EBEBEB] w-1/3 rounded" />
        <div className="h-8 bg-[#EBEBEB] w-32 rounded" />
      </div>

      {/* Cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-20 bg-white" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="card space-y-4">
        <div className="flex justify-between pb-3 border-b border-[#EBEBEB]">
          <div className="h-4 bg-[#EBEBEB] w-1/4 rounded" />
          <div className="h-4 bg-[#EBEBEB] w-1/6 rounded" />
          <div className="h-4 bg-[#EBEBEB] w-1/6 rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between py-2">
            <div className="h-3.5 bg-[#EBEBEB] w-1/3 rounded" />
            <div className="h-3.5 bg-[#EBEBEB] w-1/12 rounded" />
            <div className="h-3.5 bg-[#EBEBEB] w-1/12 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

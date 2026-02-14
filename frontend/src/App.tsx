function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold">User Log Dashboard</h1>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">MVP Frontend Init</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        <section className="rounded-lg border bg-white p-4 lg:col-span-4">
          <h2 className="mb-3 text-sm font-semibold">필터 패널</h2>
          <p className="text-sm text-slate-600">다음 단계에서 고객/기간/데이터유형 필터 UI를 연결합니다.</p>
        </section>

        <section className="rounded-lg border bg-white p-4 lg:col-span-8">
          <h2 className="mb-3 text-sm font-semibold">결과 영역</h2>
          <p className="text-sm text-slate-600">조회 결과 테이블 및 다운로드 액션이 이 영역에 배치됩니다.</p>
        </section>
      </main>
    </div>
  )
}

export default App

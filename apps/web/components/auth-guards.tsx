export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <span className="text-zinc-500 text-sm">Loading...</span>
    </div>
  );
}

export function AccessDenied({ message = "Access denied." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-2">
        <p className="text-zinc-300 font-medium">Access denied</p>
        <p className="text-zinc-500 text-sm">{message}</p>
      </div>
    </div>
  );
}

export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/apps/:path*", "/launch", "/s-admin/:path*"],
};

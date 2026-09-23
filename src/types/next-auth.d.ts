import "next-auth";
import "next-auth/jwt";

type AppRole = "ORG_ADMIN" | "COMPANY_ADMIN" | "VP_SALES" | "DIRECTOR" | "AE";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: AppRole;
      orgId: string;
    };
  }
  interface User {
    id: string;
    role: AppRole;
    orgId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AppRole;
    orgId: string;
  }
}

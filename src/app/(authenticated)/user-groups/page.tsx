"use client";

import React from "react";
import { groups } from "@/modules/user-groups";

const UserGroupsPage = React.lazy(() => groups.loadManagementComponent());

const UserGroupsRoute: React.FC = () => {
  return (
    <React.Suspense fallback={null}>
      <UserGroupsPage />
    </React.Suspense>
  );
};

export default UserGroupsRoute;

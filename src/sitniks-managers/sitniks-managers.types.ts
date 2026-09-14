/** Confirmed against Sitniks' `ManagerOpenApiEntity`/`ManagerListOpenApiEntity` schema — name lives under `user.fullname`. */
export type Manager = {
  id: number;
  name: string;
};

export type ListManagersResponse = {
  data: RawManager[];
  count: number;
};

export type RawManager = {
  id: number;
  user: {
    fullname: string;
  };
};

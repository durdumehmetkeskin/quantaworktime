declare module "react-native-keep-awake" {
  import type { ComponentType } from "react";

  const KeepAwake: ComponentType & {
    activate(): void;
    deactivate(): void;
  };
  export default KeepAwake;
}

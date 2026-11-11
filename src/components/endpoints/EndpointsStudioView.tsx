import { EndpointListPane } from "./EndpointListPane";
import { EndpointEditorPane } from "./EndpointEditorPane";

export function EndpointsStudioView() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <EndpointListPane />
      <EndpointEditorPane />
    </div>
  );
}

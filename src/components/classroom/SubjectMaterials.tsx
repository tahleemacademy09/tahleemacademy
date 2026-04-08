/**
 * SubjectMaterials.tsx
 *
 * Compatibility shim — three pages (LearningHub, LiveClasses,
 * LiveClassManagement) import this path with the prop { subjectId }.
 * The actual implementation lives in SubjectMaterialsHub.tsx which
 * accepts { subjectId, subjectTitle? }.  We simply forward the props.
 */
import SubjectMaterialsHub from "@/components/classroom/SubjectMaterialsHub";

interface Props {
  subjectId: string;
  subjectTitle?: string;
}

export default function SubjectMaterials({ subjectId, subjectTitle }: Props) {
  return <SubjectMaterialsHub subjectId={subjectId} subjectTitle={subjectTitle} />;
}

import { useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Undo,
  Redo,
  Type,
  Heading1,
  Heading2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl" | "auto";
  className?: string;
}

const RichTextEditor = ({ value, onChange, placeholder, dir, className }: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalValue = useRef(value);

  // Only set innerHTML when value changes externally (not from user typing)
  useEffect(() => {
    if (editorRef.current && value !== internalValue.current) {
      internalValue.current = value;
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    setTimeout(() => {
      if (editorRef.current) {
        internalValue.current = editorRef.current.innerHTML;
        onChange(editorRef.current.innerHTML);
      }
    }, 0);
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, text);
  }, []);

  const ToolbarButton = ({ command, icon: Icon, label, value: cmdValue }: { command: string; icon: any; label: string; value?: string }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 hover:bg-accent"
      onClick={() => execCommand(command, cmdValue)}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1 bg-muted/30">
        <ToolbarButton command="bold" icon={Bold} label="Bold" />
        <ToolbarButton command="italic" icon={Italic} label="Italic" />
        <ToolbarButton command="underline" icon={Underline} label="Underline" />
        <ToolbarButton command="strikeThrough" icon={Strikethrough} label="Strikethrough" />
        
        <Separator orientation="vertical" className="mx-1 h-6" />
        
        <ToolbarButton command="justifyLeft" icon={AlignLeft} label="Align Left" />
        <ToolbarButton command="justifyCenter" icon={AlignCenter} label="Align Center" />
        <ToolbarButton command="justifyRight" icon={AlignRight} label="Align Right" />
        
        <Separator orientation="vertical" className="mx-1 h-6" />
        
        <ToolbarButton command="insertUnorderedList" icon={List} label="Bullet List" />
        <ToolbarButton command="insertOrderedList" icon={ListOrdered} label="Numbered List" />
        
        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs hover:bg-accent"
          onClick={() => execCommand("formatBlock", "<p>")}
          title="Paragraph"
        >
          <Type className="h-4 w-4 mr-1" /> P
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs hover:bg-accent"
          onClick={() => execCommand("formatBlock", "<h3>")}
          title="Heading"
        >
          <Heading1 className="h-4 w-4 mr-1" /> H
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs hover:bg-accent"
          onClick={() => execCommand("formatBlock", "<h4>")}
          title="Sub Heading"
        >
          <Heading2 className="h-4 w-4 mr-1" /> H2
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolbarButton command="undo" icon={Undo} label="Undo" />
        <ToolbarButton command="redo" icon={Redo} label="Redo" />
      </div>

      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        dir={dir || "ltr"}
        className="min-h-[100px] px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background rounded-b-md [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground"
        data-placeholder={placeholder || "Type here..."}
        onInput={handleInput}
        onPaste={handlePaste}
        suppressContentEditableWarning
      />
    </div>
  );
};

export default RichTextEditor;

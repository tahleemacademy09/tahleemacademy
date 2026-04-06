// Replace the MaterialModal component with this fixed version:

const MaterialModal=React.memo(({ed,subjectId,sortOrder,onClose,onSaved}:{ed?:any;subjectId:string;sortOrder:number;onClose:()=>void;onSaved:()=>void})=>{
  const [f,setF]=useState({
    title:ed?.title||"",
    material_type:(ed?.material_type||"PDF") as MatType,
    file_url:ed?.file_url||"",
    content:ed?.content||"",
    is_downloadable:ed?.is_downloadable??true,
    sort_order:ed?.sort_order??sortOrder
  });
  const [file,setFile]=useState<File|null>(null);
  const [uploading,setUploading]=useState(false);
  const [drag,setDrag]=useState(false);
  const ref=useRef<HTMLInputElement>(null);

  const doSave=async()=>{
    if(!f.title){
      toast({title:"Error",description:"Please enter a title",variant:"destructive"});
      return;
    }
    
    setUploading(true);
    try {
      let fileUrl=f.file_url;
      let fileType="";
      let fileSize=0;
      
      // Upload new file if selected
      if(file){
        const ext=file.name.split(".").pop()||"bin";
        const path=`materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        
        const {error:uploadError}=await supabase.storage
          .from("subject-files")
          .upload(path,file,{upsert:true,contentType:file.type});
          
        if(uploadError){
          console.error("Upload error:",uploadError);
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }
        
        fileUrl=path;
        fileType=file.type;
        fileSize=file.size;
      }
      
      const payload:any={
        subject_id:subjectId,
        title:f.title,        material_type:f.material_type,
        file_url:fileUrl||null,
        content:f.content||null,
        is_downloadable:f.is_downloadable,
        sort_order:f.sort_order,
        ...(fileType?{file_type:fileType}:{}),
        ...(fileSize?{file_size:fileSize}:{}),
      };
      
      let saveError;
      if(ed?.id){
        const {error}=await supabase
          .from("subject_materials")
          .update(payload)
          .eq("id",ed.id);
        saveError=error;
      }else{
        const {error}=await supabase
          .from("subject_materials")
          .insert(payload);
        saveError=error;
      }
      
      if(saveError){
        console.error("Save error:",saveError);
        throw new Error(`Failed to save material: ${saveError.message}`);
      }
      
      toast({title:"✅ Material saved successfully"});
      onSaved();
      onClose();
    } catch(e:any){
      console.error("Error in doSave:",e);
      toast({
        title:"❌ Error",
        description:e.message||"Failed to save material",
        variant:"destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:60,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0,display:"flex",alignItems:"center",gap:8}}><Upload size={15} color={G}/> {ed?"Edit Material":"Upload Material"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>        <div style={{padding:20,display:"flex",flexDirection:"column",gap:16}}>
          <Fld label="Title *"><input value={f.title} onChange={e=>setF(m=>({...m,title:e.target.value}))} style={inp} placeholder="e.g. Week 1 Worksheet" autoFocus/></Fld>
          
          <div>
            <label style={{fontSize:11,fontWeight:700,color:"#374151",display:"block",marginBottom:8}}>Type</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
              {MATERIAL_TYPES.map(mt=>{
                const c=matCfg[mt],Icon=c.icon,sel=f.material_type===mt;
                return <button key={mt} onClick={()=>setF(m=>({...m,material_type:mt}))}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:12,border:`2px solid ${sel?c.text:"#E5E7EB"}`,background:sel?c.bg:"#fff",color:sel?c.text:"#6B7280",fontSize:10,fontWeight:sel?700:500,cursor:"pointer"}}>
                  <Icon size={15}/>{mt}
                </button>;
              })}
            </div>
          </div>
          
          {f.material_type!=="Link"&&f.material_type!=="Text"&&(
            <div>
              <label style={{fontSize:11,fontWeight:700,color:"#374151",display:"block",marginBottom:8}}>File Upload</label>
              <div style={{border:`2px dashed ${drag?G:"#D1D5DB"}`,borderRadius:16,padding:20,textAlign:"center",cursor:"pointer",background:drag?"#F0FDF4":"#FAFAFA"}}
                onClick={()=>ref.current?.click()}
                onDragOver={e=>{e.preventDefault();setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);const fi=e.dataTransfer.files[0];if(fi){setFile(fi);if(!f.title)setF(m=>({...m,title:fi.name.replace(/\.[^/.]+$/,""))}}}}>
                <input ref={ref} type="file" style={{display:"none"}} accept="*/*"
                  onChange={e=>{const fi=e.target.files?.[0];if(fi){setFile(fi);if(!f.title)setF(m=>({...m,title:fi.name.replace(/\.[^/.]+$/,""))}}}}/>
                {file?(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:"#D1FAE5",display:"flex",alignItems:"center",justifyContent:"center"}}><Check size={18} color="#16A34A"/></div>
                    <div style={{textAlign:"left"}}>
                      <p style={{fontSize:13,fontWeight:600,color:"#374151",margin:0}}>{file.name}</p>
                      <p style={{fontSize:11,color:"#9CA3AF",margin:0}}>{fmtSize(file.size)}</p>
                    </div>
                    <button onClick={e=>{e.stopPropagation();setFile(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF"}}><X size={15}/></button>
                  </div>
                ):(
                  <><Upload size={26} style={{color:"#D1D5DB",margin:"0 auto 8px",display:"block"}}/><p style={{fontSize:13,color:"#6B7280",fontWeight:500,margin:"0 0 4px"}}>Drop file here or tap to browse</p><p style={{fontSize:11,color:"#9CA3AF",margin:0}}>PDF, Word, Images, Audio, Video — all formats</p></>
                )}
              </div>
              {f.file_url&&!file&&(
                <div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:11,color:"#166534",display:"flex",alignItems:"center",gap:6}}>
                  <Check size={14}/> Current file: {f.file_url.split("/").pop()}
                </div>
              )}
              <p style={{fontSize:11,color:"#9CA3AF",textAlign:"center",margin:"8px 0 0"}}>— or paste a URL —</p>
              <input value={f.file_url} onChange={e=>setF(m=>({...m,file_url:e.target.value}))} style={{...inp,marginTop:6}} placeholder="https://…"/>
            </div>
          )}
          
          {f.material_type==="Link"&&<Fld label="URL *"><input value={f.file_url} onChange={e=>setF(m=>({...m,file_url:e.target.value}))} style={inp} placeholder="https://…"/></Fld>}          {f.material_type==="Text"&&<Fld label="Content"><textarea value={f.content} onChange={e=>setF(m=>({...m,content:e.target.value}))} rows={5} style={{...inp,resize:"vertical"}}/></Fld>}
          
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderRadius:12,background:"#F9FAFB",border:"1px solid #E5E7EB"}}>
            <div><p style={{fontSize:13,fontWeight:600,color:"#374151",margin:0}}>Allow Download</p><p style={{fontSize:11,color:"#9CA3AF",margin:"2px 0 0"}}>Students can save this file</p></div>
            <Switch checked={f.is_downloadable} onCheckedChange={v=>setF(m=>({...m,is_downloadable:v}))}/>
          </div>
          
          <button onClick={doSave} disabled={!f.title||uploading}
            style={{padding:"13px",borderRadius:12,border:"none",background:!f.title||uploading?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:!f.title||uploading?"#9ca3af":"#fff",fontWeight:800,cursor:!f.title||uploading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:14}}>
            {uploading?<><Loader2 size={15} style={{animation:"spin .8s linear infinite"}}/> Uploading…</>:<><Upload size={14}/> {ed?"Save Changes":"Upload Material"}</>}
          </button>
        </div>
      </div>
    </div>
  );
});
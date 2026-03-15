"use client"
import { useState, useEffect } from "react"
import { T } from "../tokens"
import { supabase } from "../lib/supabase"
import { useAuth } from "../lib/auth"

export default function Projects() {
  const { user, profile } = useAuth()
  const [activeView, setActiveView] = useState("list")
  const [projects, setProjects] = useState([])
  const [sections, setSections] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)
  const [showNewProjectForm, setShowNewProjectForm] = useState(false)
  const [showNewSectionForm, setShowNewSectionForm] = useState(false)
  const [newSectionName, setNewSectionName] = useState("")

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user])

  const fetchData = async () => {
    try {
      // Fetch projects
      const { data: projectsData } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false })

      // Fetch sections
      const { data: sectionsData } = await supabase
        .from("sections")
        .select("*")
        .order("display_order")

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false })

      setProjects(projectsData || [])
      setSections(sectionsData || [])
      setTasks(tasksData || [])
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async (projectData) => {
    try {
      const { data, error } = await supabase
        .from("projects")
        .insert([{
          ...projectData,
          created_by: user.id,
          organization_id: profile?.organization_id
        }])
        .select()

      if (error) throw error
      
      setProjects([data[0], ...projects])
      setShowNewProjectForm(false)
    } catch (error) {
      console.error("Error creating project:", error)
    }
  }

  const createSection = async () => {
    if (!newSectionName.trim()) return

    try {
      const { data, error } = await supabase
        .from("sections")
        .insert([{
          name: newSectionName,
          project_id: selectedProject?.id,
          created_by: user.id,
          organization_id: profile?.organization_id,
          display_order: sections.length
        }])
        .select()

      if (error) throw error
      
      setSections([...sections, data[0]])
      setNewSectionName("")
      setShowNewSectionForm(false)
    } catch (error) {
      console.error("Error creating section:", error)
    }
  }

  const getTasksForSection = (sectionId) => {
    return tasks.filter(task => task.section_id === sectionId)
  }

  const getSectionsForProject = (projectId) => {
    return sections.filter(section => section.project_id === projectId)
  }

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: T.text }}>
        Loading projects...
      </div>
    )
  }

  if (activeView === "board") {
    return (
      <div style={{ padding: "2rem", color: T.text }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: "2rem"
        }}>
          <div>
            <h1 style={{ 
              fontSize: "2rem", 
              fontWeight: "600", 
              margin: 0,
              marginBottom: "0.5rem"
            }}>
              Projects
            </h1>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => setActiveView("list")}
                style={{
                  background: "none",
                  border: "none",
                  color: T.text,
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  cursor: "pointer"
                }}
              >
                List
              </button>
              <button
                onClick={() => setActiveView("board")}
                style={{
                  background: T.accent,
                  border: "none",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  cursor: "pointer"
                }}
              >
                Board
              </button>
            </div>
          </div>
        </div>

        {/* Project Selector for Board View */}
        <div style={{ marginBottom: "2rem" }}>
          <select
            value={selectedProject?.id || ""}
            onChange={(e) => {
              const project = projects.find(p => p.id === e.target.value)
              setSelectedProject(project)
            }}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              color: T.text,
              fontSize: "1rem"
            }}
          >
            <option value="">Select a project to view board</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {selectedProject ? (
          <div>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: "1rem"
            }}>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "500", margin: 0 }}>
                {selectedProject.name}
              </h2>
              <button
                onClick={() => setShowNewSectionForm(true)}
                style={{
                  background: T.accent,
                  border: "none",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: "500"
                }}
              >
                + Add Section
              </button>
            </div>

            {/* New Section Form */}
            {showNewSectionForm && (
              <div style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: "0.5rem",
                padding: "1rem",
                marginBottom: "1rem"
              }}>
                <input
                  type="text"
                  placeholder="Section name"
                  defaultValue={newSectionName}
                  onBlur={(e) => setNewSectionName(e.target.value)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${T.border}`,
                    borderRadius: "0.25rem",
                    padding: "0.5rem",
                    color: T.text,
                    width: "300px",
                    marginBottom: "1rem"
                  }}
                  autoFocus
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={createSection}
                    style={{
                      background: T.accent,
                      border: "none",
                      color: "white",
                      padding: "0.5rem 1rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem"
                    }}
                  >
                    Add Section
                  </button>
                  <button
                    onClick={() => {
                      setShowNewSectionForm(false)
                      setNewSectionName("")
                    }}
                    style={{
                      background: "transparent",
                      border: `1px solid ${T.border}`,
                      color: T.text,
                      padding: "0.5rem 1rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem"
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Board Columns */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1rem",
              overflowX: "auto"
            }}>
              {getSectionsForProject(selectedProject.id).map(section => (
                <div
                  key={section.id}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    minHeight: "400px"
                  }}
                >
                  <h3 style={{
                    fontSize: "1.125rem",
                    fontWeight: "500",
                    margin: 0,
                    marginBottom: "1rem",
                    color: T.text
                  }}>
                    {section.name}
                  </h3>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {getTasksForSection(section.id).map(task => (
                      <div
                        key={task.id}
                        style={{
                          background: T.background,
                          border: `1px solid ${T.border}`,
                          borderRadius: "0.25rem",
                          padding: "0.75rem",
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ 
                          fontSize: "0.875rem", 
                          fontWeight: "500",
                          marginBottom: "0.25rem"
                        }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ 
                            fontSize: "0.75rem", 
                            color: T.muted,
                            marginBottom: "0.5rem"
                          }}>
                            {task.description}
                          </div>
                        )}
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span style={{
                            fontSize: "0.75rem",
                            color: task.status === "completed" ? T.success : 
                                   task.status === "in_progress" ? T.accent : T.muted,
                            background: task.status === "completed" ? `${T.success}20` : 
                                       task.status === "in_progress" ? `${T.accent}20` : `${T.muted}20`,
                            padding: "0.25rem 0.5rem",
                            borderRadius: "0.25rem"
                          }}>
                            {task.status?.replace("_", " ") || "todo"}
                          </span>
                          {task.due_date && (
                            <span style={{ fontSize: "0.75rem", color: T.muted }}>
                              {new Date(task.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            textAlign: "center",
            padding: "3rem",
            color: T.muted
          }}>
            Select a project above to view its board
          </div>
        )}
      </div>
    )
  }

  // List View (original code)
  return (
    <div style={{ padding: "2rem", color: T.text }}>
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "2rem"
      }}>
        <div>
          <h1 style={{ 
            fontSize: "2rem", 
            fontWeight: "600", 
            margin: 0,
            marginBottom: "0.5rem"
          }}>
            Projects
          </h1>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => setActiveView("list")}
              style={{
                background: T.accent,
                border: "none",
                color: "white",
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                cursor: "pointer"
              }}
            >
              List
            </button>
            <button
              onClick={() => setActiveView("board")}
              style={{
                background: "none",
                border: "none",
                color: T.text,
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                cursor: "pointer"
              }}
            >
              Board
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowNewProjectForm(true)}
          style={{
            background: T.accent,
            border: "none",
            color: "white",
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "500"
          }}
        >
          + New Project
        </button>
      </div>

      {showNewProjectForm && (
        <NewProjectForm 
          onSubmit={createProject}
          onCancel={() => setShowNewProjectForm(false)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
        
        {projects.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "3rem",
            color: T.muted
          }}>
            No projects yet. Create your first project to get started.
          </div>
        )}
      </div>
    </div>
  )
}

function NewProjectForm({ onSubmit, onCancel }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      status: "active"
    })
    
    setName("")
    setDescription("")
  }

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: "0.5rem",
      padding: "1.5rem",
      marginBottom: "2rem"
    }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ 
            display: "block", 
            fontSize: "0.875rem", 
            fontWeight: "500",
            marginBottom: "0.5rem",
            color: T.text
          }}>
            Project Name
          </label>
          <input
            type="text"
            defaultValue={name}
            onBlur={(e) => setName(e.target.value)}
            style={{
              width: "100%",
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: "0.25rem",
              padding: "0.75rem",
              color: T.text,
              fontSize: "1rem"
            }}
            placeholder="Enter project name"
            autoFocus
          />
        </div>
        
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ 
            display: "block", 
            fontSize: "0.875rem", 
            fontWeight: "500",
            marginBottom: "0.5rem",
            color: T.text
          }}>
            Description
          </label>
          <textarea
            defaultValue={description}
            onBlur={(e) => setDescription(e.target.value)}
            style={{
              width: "100%",
              background: "transparent",
              border: `1px solid ${T.border}`,
              borderRadius: "0.25rem",
              padding: "0.75rem",
              color: T.text,
              fontSize: "1rem",
              minHeight: "100px",
              resize: "vertical"
            }}
            placeholder="Enter project description"
          />
        </div>
        
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            type="submit"
            style={{
              background: T.accent,
              border: "none",
              color: "white",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: "500"
            }}
          >
            Create Project
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: `1px solid ${T.border}`,
              color: T.text,
              padding: "0.75rem 1.5rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem"
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function ProjectCard({ project }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: "0.5rem",
      padding: "1.5rem",
      cursor: "pointer",
      transition: "all 0.2s ease"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "1rem"
      }}>
        <div>
          <h3 style={{
            fontSize: "1.25rem",
            fontWeight: "600",
            margin: 0,
            marginBottom: "0.5rem"
          }}>
            {project.name}
          </h3>
          {project.description && (
            <p style={{
              color: T.muted,
              fontSize: "0.875rem",
              margin: 0,
              lineHeight: "1.5"
            }}>
              {project.description}
            </p>
          )}
        </div>
        <span style={{
          background: project.status === "active" ? `${T.success}20` : `${T.muted}20`,
          color: project.status === "active" ? T.success : T.muted,
          padding: "0.25rem 0.75rem",
          borderRadius: "1rem",
          fontSize: "0.75rem",
          fontWeight: "500"
        }}>
          {project.status}
        </span>
      </div>
      
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "0.75rem",
        color: T.muted
      }}>
        <span>
          Created {new Date(project.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
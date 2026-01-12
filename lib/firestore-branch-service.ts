import { db } from "./firebase"
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
} from "firebase/firestore"

export type Branch = {
  id: string
  branchName: string
  address: string
  createdAt?: string
  updatedAt?: string
}

const BRANCHES_COLLECTION = "branches"

// Get all branches
export const getAllBranches = async (): Promise<Branch[]> => {
  try {
    console.log("🔍 Querying branches collection...")
    const querySnapshot = await getDocs(collection(db, BRANCHES_COLLECTION))
    console.log(`✓ Found ${querySnapshot.size} branches`)

    const branches = querySnapshot.docs.map((doc) => {
      console.log(`  - Branch: ${doc.id}`, doc.data())
      return {
        id: doc.id,
        ...doc.data(),
      } as Branch
    })
    return branches
  } catch (error) {
    console.error("❌ Error fetching branches:", error)
    throw error
  }
}

// Add new branch
export const addBranch = async (branch: Omit<Branch, "id" | "createdAt" | "updatedAt">): Promise<string> => {
  try {
    console.log("➕ Adding new branch:", branch)
    const docRef = await addDoc(collection(db, BRANCHES_COLLECTION), {
      ...branch,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Branch added with ID: ${docRef.id}`)
    return docRef.id
  } catch (error) {
    console.error("❌ Error adding branch:", error)
    throw error
  }
}

// Update branch
export const updateBranch = async (branchId: string, updates: Partial<Branch>): Promise<void> => {
  try {
    console.log("✏️ Updating branch:", branchId, updates)
    const docRef = doc(db, BRANCHES_COLLECTION, branchId)
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✓ Branch updated: ${branchId}`)
  } catch (error) {
    console.error("❌ Error updating branch:", error)
    throw error
  }
}

// Delete branch
export const deleteBranch = async (branchId: string): Promise<void> => {
  try {
    console.log("🗑️ Deleting branch:", branchId)
    const docRef = doc(db, BRANCHES_COLLECTION, branchId)
    await deleteDoc(docRef)
    console.log(`✓ Branch deleted: ${branchId}`)
  } catch (error) {
    console.error("❌ Error deleting branch:", error)
    throw error
  }
}

// Get branch by ID
export const getBranchById = async (branchId: string): Promise<Branch | null> => {
  try {
    const docRef = doc(db, BRANCHES_COLLECTION, branchId)
    const docSnap = await getDocs(collection(db, BRANCHES_COLLECTION))
    
    const branch = docSnap.docs.find(d => d.id === branchId)
    if (!branch) return null
    
    return {
      id: branch.id,
      ...branch.data(),
    } as Branch
  } catch (error) {
    console.error("❌ Error fetching branch:", error)
    throw error
  }
}

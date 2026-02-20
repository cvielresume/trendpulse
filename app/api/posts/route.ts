import { NextRequest, NextResponse } from "next/server";
import { fetchCategoryPosts, fetchPainPoints } from "@/lib/reddit-fetcher";
import { subredditMapping } from "@/lib/reddit-config";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || "trending";
  const forceRefresh = searchParams.get("refresh") === "true";
  
  try {
    let result;
    let subreddits: string[] = [];
    
    // Handle pain-points category specially
    if (category === "pain-points") {
      result = await fetchPainPoints();
    } else {
      // Get subreddits for this category
      subreddits = subredditMapping[category] || subredditMapping.trending;
      result = await fetchCategoryPosts(subreddits, 25);
    }
    
    return NextResponse.json({
      success: result.posts.length > 0,
      posts: result.posts,
      category,
      fetchedAt: Date.now(),
      subreddits,
      error: result.error || null,
    });
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch posts: " + String(error),
        posts: [],
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

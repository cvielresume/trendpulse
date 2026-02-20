import { NextRequest, NextResponse } from "next/server";
import { fetchCategoryPosts, fetchPainPoints } from "@/lib/reddit-fetcher";
import { subredditMapping } from "@/lib/reddit-config";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || "trending";
  const forceRefresh = searchParams.get("refresh") === "true";
  
  try {
    let posts;
    let subreddits: string[] = [];
    
    // Handle pain-points category specially
    if (category === "pain-points") {
      posts = await fetchPainPoints();
    } else {
      // Get subreddits for this category
      subreddits = subredditMapping[category] || subredditMapping.trending;
      posts = await fetchCategoryPosts(subreddits, 25);
    }
    
    return NextResponse.json({
      success: true,
      posts,
      category,
      fetchedAt: Date.now(),
      subreddits,
    });
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch posts",
        posts: [],
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
